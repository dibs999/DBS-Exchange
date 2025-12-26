// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IOracle {
    function getPriceData(bytes32 marketId) external view returns (uint256, uint256);
}

contract PerpEngine is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant ONE = 1e18;

    struct Market {
        bool isActive;
        uint256 initialMarginBps;
        uint256 maintenanceMarginBps;
        uint256 maxLeverage;
        int256 cumulativeFundingRate;
        int256 fundingRatePerSecond;
        uint256 lastFundingTime;
    }

    struct Position {
        int256 size;
        uint256 entryPrice;
        uint256 margin;
        int256 fundingEntry;
    }

    IERC20 public immutable collateral;
    IOracle public oracle;
    uint256 public liquidationFeeBps = 50;
    uint256 public maxPriceAge = 300;

    mapping(bytes32 => Market) public markets;
    mapping(address => mapping(bytes32 => Position)) public positions;
    mapping(address => uint256) public collateralBalance;
    mapping(address => mapping(address => bool)) public operators;

    event Deposit(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);
    event MarketCreated(bytes32 indexed marketId, uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 maxLeverage);
    event FundingRateUpdated(bytes32 indexed marketId, int256 ratePerSecond, int256 cumulativeFundingRate);
    event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, uint256 margin);
    event PositionUpdated(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, uint256 margin, int256 realizedPnl);
    event PositionClosed(address indexed account, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl);
    event Liquidated(
        address indexed account,
        address indexed liquidator,
        bytes32 indexed marketId,
        int256 size,
        uint256 exitPrice,
        int256 pnl,
        uint256 penalty
    );
    event OperatorUpdated(address indexed account, address indexed operator, bool approved);
    event OracleUpdated(address indexed oracle);
    event MaxPriceAgeUpdated(uint256 maxPriceAge);

    constructor(address collateralToken, address oracle_) Ownable(msg.sender) {
        require(collateralToken != address(0) && oracle_ != address(0), "Bad address");
        collateral = IERC20(collateralToken);
        oracle = IOracle(oracle_);
    }

    function createMarket(bytes32 marketId, uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 maxLeverage) external onlyOwner {
        require(!markets[marketId].isActive, "Market exists");
        require(initialMarginBps > 0 && initialMarginBps < BPS, "Bad initial");
        require(maintenanceMarginBps > 0 && maintenanceMarginBps < BPS, "Bad maintenance");
        require(initialMarginBps >= maintenanceMarginBps, "Initial < maintenance");
        require(maxLeverage >= 1, "Bad leverage");
        markets[marketId] = Market({
            isActive: true,
            initialMarginBps: initialMarginBps,
            maintenanceMarginBps: maintenanceMarginBps,
            maxLeverage: maxLeverage,
            cumulativeFundingRate: 0,
            fundingRatePerSecond: 0,
            lastFundingTime: block.timestamp
        });
        emit MarketCreated(marketId, initialMarginBps, maintenanceMarginBps, maxLeverage);
    }

    function setFundingRate(bytes32 marketId, int256 ratePerSecond) external onlyOwner {
        require(markets[marketId].isActive, "Market inactive");
        _updateFunding(marketId);
        markets[marketId].fundingRatePerSecond = ratePerSecond;
        emit FundingRateUpdated(marketId, ratePerSecond, markets[marketId].cumulativeFundingRate);
    }

    function setLiquidationFeeBps(uint256 feeBps) external onlyOwner {
        require(feeBps <= 500, "Fee too high");
        liquidationFeeBps = feeBps;
    }

    function setOracle(address oracle_) external onlyOwner {
        require(oracle_ != address(0), "Bad oracle");
        oracle = IOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setMaxPriceAge(uint256 maxAge) external onlyOwner {
        require(maxAge >= 30 && maxAge <= 3600, "Bad max age");
        maxPriceAge = maxAge;
        emit MaxPriceAgeUpdated(maxAge);
    }

    function setOperator(address operator, bool approved) external {
        operators[msg.sender][operator] = approved;
        emit OperatorUpdated(msg.sender, operator, approved);
    }

    function isOperator(address account, address operator) external view returns (bool) {
        return operators[account][operator];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount=0");
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        collateralBalance[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount=0");
        require(collateralBalance[msg.sender] >= amount, "Insufficient balance");
        collateralBalance[msg.sender] -= amount;
        collateral.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    function openPosition(bytes32 marketId, int256 sizeDelta, uint256 leverage) external nonReentrant whenNotPaused {
        _openPosition(msg.sender, marketId, sizeDelta, leverage);
    }

    function openPositionFor(address account, bytes32 marketId, int256 sizeDelta, uint256 leverage) external nonReentrant whenNotPaused {
        require(account != address(0), "Bad account");
        require(operators[account][msg.sender], "Not authorized");
        _openPosition(account, marketId, sizeDelta, leverage);
    }

    function closePosition(bytes32 marketId) external nonReentrant whenNotPaused {
        _closePosition(msg.sender, marketId);
    }

    function closePositionFor(address account, bytes32 marketId) external nonReentrant whenNotPaused {
        require(account != address(0), "Bad account");
        require(operators[account][msg.sender], "Not authorized");
        _closePosition(account, marketId);
    }

    function liquidate(bytes32 marketId, address account) external nonReentrant whenNotPaused {
        Position storage position = positions[account][marketId];
        require(position.size != 0, "No position");
        Market storage market = markets[marketId];

        _updateFunding(marketId);
        _applyFunding(position, market);

        uint256 price = _getPrice(marketId);
        require(_isLiquidatable(position, market, price), "Not liquidatable");

        int256 size = position.size;
        int256 pnl = _pnl(size, position.entryPrice, price);
        int256 equity = int256(position.margin) + pnl;

        uint256 penalty = 0;
        if (equity > 0) {
            uint256 equityU = uint256(equity);
            penalty = (equityU * liquidationFeeBps) / BPS;
            if (penalty > 0) {
                collateral.safeTransfer(msg.sender, penalty);
            }
            uint256 remaining = equityU - penalty;
            if (remaining > 0) {
                collateralBalance[account] += remaining;
            }
        }

        delete positions[account][marketId];

        emit Liquidated(account, msg.sender, marketId, size, price, pnl, penalty);
    }

    function getPosition(address account, bytes32 marketId) external view returns (Position memory) {
        return positions[account][marketId];
    }

    function _openPosition(address account, bytes32 marketId, int256 sizeDelta, uint256 leverage) internal {
        require(sizeDelta != 0, "Size=0");
        Market storage market = markets[marketId];
        require(market.isActive, "Market inactive");
        require(leverage >= 1 && leverage <= market.maxLeverage, "Bad leverage");
        require(leverage <= (BPS / market.initialMarginBps), "Leverage too high");

        _updateFunding(marketId);
        Position storage position = positions[account][marketId];
        _applyFunding(position, market);

        uint256 price = _getPrice(marketId);

        bool sameSide = position.size == 0 || (position.size > 0 && sizeDelta > 0) || (position.size < 0 && sizeDelta < 0);

        if (position.size != 0 && !sameSide) {
            uint256 absDelta = _abs(sizeDelta);
            uint256 absSize = _abs(position.size);
            require(absDelta <= absSize, "Close before reverse");
            int256 realized = _reducePosition(account, position, price, sizeDelta);
            emit PositionUpdated(account, marketId, position.size, position.entryPrice, position.margin, realized);
            if (position.size == 0) {
                emit PositionClosed(account, marketId, sizeDelta, price, realized);
            }
            return;
        }

        uint256 notionalDelta = (_abs(sizeDelta) * price) / ONE;
        uint256 requiredMargin = notionalDelta / leverage;
        require(collateralBalance[account] >= requiredMargin, "Insufficient collateral");
        collateralBalance[account] -= requiredMargin;

        if (position.size == 0) {
            position.size = sizeDelta;
            position.entryPrice = price;
            position.margin = requiredMargin;
            position.fundingEntry = market.cumulativeFundingRate;
            _assertInitialMargin(position.size, position.margin, price, market.initialMarginBps);
            emit PositionOpened(account, marketId, position.size, position.entryPrice, position.margin);
            return;
        }

        uint256 currentNotional = (_abs(position.size) * position.entryPrice) / ONE;
        uint256 newNotional = currentNotional + notionalDelta;
        uint256 newSizeAbs = _abs(position.size + sizeDelta);
        position.entryPrice = (newNotional * ONE) / newSizeAbs;
        position.size += sizeDelta;
        position.margin += requiredMargin;
        position.fundingEntry = market.cumulativeFundingRate;
        _assertInitialMargin(position.size, position.margin, price, market.initialMarginBps);
        emit PositionUpdated(account, marketId, position.size, position.entryPrice, position.margin, 0);
    }

    function _closePosition(address account, bytes32 marketId) internal {
        Position storage position = positions[account][marketId];
        require(position.size != 0, "No position");
        Market storage market = markets[marketId];

        _updateFunding(marketId);
        _applyFunding(position, market);

        uint256 price = _getPrice(marketId);

        int256 size = position.size;
        int256 pnl = _pnl(size, position.entryPrice, price);
        uint256 margin = position.margin;

        delete positions[account][marketId];

        int256 net = int256(margin) + pnl;
        if (net > 0) {
            collateralBalance[account] += uint256(net);
        }

        emit PositionClosed(account, marketId, size, price, pnl);
    }

    function _getPrice(bytes32 marketId) internal view returns (uint256) {
        (uint256 price, uint256 updatedAt) = oracle.getPriceData(marketId);
        require(price > 0, "No price");
        require(updatedAt > 0 && block.timestamp - updatedAt <= maxPriceAge, "Stale price");
        return price;
    }

    function _assertInitialMargin(int256 size, uint256 margin, uint256 price, uint256 initialMarginBps) internal pure {
        uint256 notional = (_abs(size) * price) / ONE;
        uint256 required = (notional * initialMarginBps) / BPS;
        require(margin >= required, "Initial margin");
    }

    function _updateFunding(bytes32 marketId) internal {
        Market storage market = markets[marketId];
        if (!market.isActive || market.lastFundingTime == 0) {
            market.lastFundingTime = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - market.lastFundingTime;
        if (elapsed == 0) return;
        market.cumulativeFundingRate += market.fundingRatePerSecond * int256(elapsed);
        market.lastFundingTime = block.timestamp;
    }

    function _applyFunding(Position storage position, Market storage market) internal {
        if (position.size == 0) {
            position.fundingEntry = market.cumulativeFundingRate;
            return;
        }
        int256 payment = (position.size * (market.cumulativeFundingRate - position.fundingEntry)) / int256(ONE);
        if (payment > 0) {
            uint256 debit = uint256(payment);
            if (debit >= position.margin) {
                position.margin = 0;
            } else {
                position.margin -= debit;
            }
        } else if (payment < 0) {
            position.margin += uint256(-payment);
        }
        position.fundingEntry = market.cumulativeFundingRate;
    }

    function _reducePosition(address account, Position storage position, uint256 price, int256 sizeDelta) internal returns (int256) {
        uint256 absDelta = _abs(sizeDelta);
        uint256 absSize = _abs(position.size);
        uint256 marginReleased = (position.margin * absDelta) / absSize;

        int256 closedSize = position.size > 0 ? int256(absDelta) : -int256(absDelta);
        int256 pnl = _pnl(closedSize, position.entryPrice, price);

        position.margin -= marginReleased;
        int256 net = int256(marginReleased) + pnl;
        if (net >= 0) {
            collateralBalance[account] += uint256(net);
        } else {
            uint256 deficit = uint256(-net);
            if (deficit >= position.margin) {
                position.margin = 0;
            } else {
                position.margin -= deficit;
            }
        }

        position.size += sizeDelta;
        if (position.size == 0) {
            position.entryPrice = 0;
            position.fundingEntry = 0;
        }
        return pnl;
    }

    function _isLiquidatable(Position storage position, Market storage market, uint256 price) internal view returns (bool) {
        uint256 notional = (_abs(position.size) * price) / ONE;
        if (notional == 0) return false;
        int256 pnl = _pnl(position.size, position.entryPrice, price);
        int256 equity = int256(position.margin) + pnl;
        if (equity <= 0) return true;
        uint256 equityU = uint256(equity);
        return (equityU * BPS) < (notional * market.maintenanceMarginBps);
    }

    function _pnl(int256 size, uint256 entryPrice, uint256 price) internal pure returns (int256) {
        int256 diff = int256(price) - int256(entryPrice);
        return (diff * size) / int256(ONE);
    }

    function _abs(int256 value) internal pure returns (uint256) {
        return uint256(value >= 0 ? value : -value);
    }
}
