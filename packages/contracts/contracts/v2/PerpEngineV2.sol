// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IOracleRouter {
    function getPriceData(bytes32 marketId) external view returns (uint256 price, uint256 updatedAt);
}

contract PerpEngineV2 is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant BPS = 10_000;
    uint256 public constant ONE = 1e18;
    uint256 public constant SCALE = 1e12; // USDC (6) -> 1e18 internal
    uint256 public constant SECONDS_PER_HOUR = 3600;

    struct Market {
        bool active;
        uint256 initialMarginBps;
        uint256 maintenanceMarginBps;
        uint256 maxLeverage;
        uint256 maxOpenInterest;
        uint256 maxAccountExposure;
        uint256 maxFundingRateBps; // per hour
        uint256 openInterest;
        uint256 longSize;
        uint256 shortSize;
        int256 cumulativeFundingRate;
        int256 fundingRatePerSecond;
        uint256 lastFundingTime;
    }

    struct Position {
        int256 size;
        uint256 entryPrice;
        int256 fundingEntry;
    }

    struct FillSettlement {
        address account;
        bytes32 marketId;
        int256 sizeDelta;
        uint256 price;
        bool isMaker;
        uint256 feeBps;
    }

    IERC20Upgradeable public collateral;
    IOracleRouter public oracleRouter;
    uint256 public maxPriceAge;

    address public orderbook;
    address public vault;
    address public insuranceFund;
    address public treasury;

    uint256 public vaultFeeShareBps;
    uint256 public insuranceFeeShareBps;
    uint256 public treasuryFeeShareBps;
    uint256 public liquidationFeeBps;
    uint256 public badDebt;
    bool public adlEnabled;

    mapping(bytes32 => Market) public markets;
    mapping(address => mapping(bytes32 => Position)) public positions;
    mapping(address => uint256) public collateralBalance; // 1e18 internal
    mapping(address => bool) public fundingKeepers;
    mapping(address => bool) public adlKeepers;

    mapping(address => bytes32[]) private accountMarkets;
    mapping(address => mapping(bytes32 => uint256)) private accountMarketIndex; // 1-based

    event Deposit(address indexed account, uint256 amount, uint256 amountInternal);
    event Withdraw(address indexed account, uint256 amount, uint256 amountInternal);
    event MarketCreated(
        bytes32 indexed marketId,
        uint256 initialMarginBps,
        uint256 maintenanceMarginBps,
        uint256 maxLeverage,
        uint256 maxFundingRateBps
    );
    event MarketUpdated(bytes32 indexed marketId);
    event FundingRateUpdated(bytes32 indexed marketId, int256 ratePerSecond, int256 cumulativeFundingRate);
    event FundingKeeperSet(address indexed keeper, bool allowed);
    event AdlKeeperSet(address indexed keeper, bool allowed);
    event FundingConfigUpdated(bytes32 indexed marketId, uint256 maxFundingRateBps);
    event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice);
    event PositionUpdated(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, int256 realizedPnl);
    event PositionClosed(address indexed account, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl);
    event LiquidationExecuted(
        address indexed account,
        address indexed liquidator,
        bytes32 indexed marketId,
        int256 size,
        uint256 price,
        int256 pnl,
        uint256 penalty
    );
    event AdlExecuted(address indexed account, bytes32 indexed marketId, int256 size, uint256 price, int256 pnl);
    event OracleRouterUpdated(address indexed oracleRouter);
    event OrderbookUpdated(address indexed orderbook);
    event FeeRecipientsUpdated(address indexed vault, address indexed insuranceFund, address indexed treasury);
    event FeeSharesUpdated(uint256 vaultBps, uint256 insuranceBps, uint256 treasuryBps);
    event LiquidationFeeUpdated(uint256 feeBps);
    event MaxPriceAgeUpdated(uint256 maxPriceAge);
    event BadDebtIncreased(uint256 amount);
    event AdlToggled(bool enabled);
    event BadDebtCovered(uint256 amount);

    error InvalidAmount();
    error MarketInactive();
    error NotOrderbook();
    error InsufficientCollateral();
    error StalePrice();
    error NotLiquidatable();
    error AdlDisabled();
    error NotFundingKeeper();
    error NotAdlKeeper();

    modifier onlyOrderbook() {
        if (msg.sender != orderbook) revert NotOrderbook();
        _;
    }

    modifier onlyFundingKeeper() {
        if (!fundingKeepers[msg.sender] && msg.sender != owner()) revert NotFundingKeeper();
        _;
    }

    modifier onlyAdlKeeper() {
        if (!adlKeepers[msg.sender] && msg.sender != owner()) revert NotAdlKeeper();
        _;
    }

    function initialize(
        address collateralToken,
        address oracleRouter_,
        address vault_,
        address insuranceFund_,
        address treasury_
    ) external initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(collateralToken != address(0) && oracleRouter_ != address(0), "Bad address");
        collateral = IERC20Upgradeable(collateralToken);
        oracleRouter = IOracleRouter(oracleRouter_);
        vault = vault_;
        insuranceFund = insuranceFund_;
        treasury = treasury_;

        maxPriceAge = 60;
        liquidationFeeBps = 50;
        vaultFeeShareBps = 7000;
        insuranceFeeShareBps = 2500;
        treasuryFeeShareBps = 500;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setOrderbook(address orderbook_) external onlyOwner {
        require(orderbook_ != address(0), "Bad orderbook");
        orderbook = orderbook_;
        emit OrderbookUpdated(orderbook_);
    }

    function setOracleRouter(address oracleRouter_) external onlyOwner {
        require(oracleRouter_ != address(0), "Bad oracle");
        oracleRouter = IOracleRouter(oracleRouter_);
        emit OracleRouterUpdated(oracleRouter_);
    }

    function setFeeRecipients(address vault_, address insuranceFund_, address treasury_) external onlyOwner {
        vault = vault_;
        insuranceFund = insuranceFund_;
        treasury = treasury_;
        emit FeeRecipientsUpdated(vault_, insuranceFund_, treasury_);
    }

    function setFeeShares(uint256 vaultBps, uint256 insuranceBps, uint256 treasuryBps) external onlyOwner {
        require(vaultBps + insuranceBps + treasuryBps == BPS, "Share sum");
        vaultFeeShareBps = vaultBps;
        insuranceFeeShareBps = insuranceBps;
        treasuryFeeShareBps = treasuryBps;
        emit FeeSharesUpdated(vaultBps, insuranceBps, treasuryBps);
    }

    function setLiquidationFeeBps(uint256 feeBps) external onlyOwner {
        require(feeBps <= 500, "Fee too high");
        liquidationFeeBps = feeBps;
        emit LiquidationFeeUpdated(feeBps);
    }

    function setMaxPriceAge(uint256 maxAge) external onlyOwner {
        require(maxAge >= 30 && maxAge <= 3600, "Bad max age");
        maxPriceAge = maxAge;
        emit MaxPriceAgeUpdated(maxAge);
    }

    function toggleAdl(bool enabled) external onlyOwner {
        adlEnabled = enabled;
        emit AdlToggled(enabled);
    }

    function setFundingKeeper(address keeper, bool allowed) external onlyOwner {
        fundingKeepers[keeper] = allowed;
        emit FundingKeeperSet(keeper, allowed);
    }

    function setAdlKeeper(address keeper, bool allowed) external onlyOwner {
        adlKeepers[keeper] = allowed;
        emit AdlKeeperSet(keeper, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function createMarket(
        bytes32 marketId,
        uint256 initialMarginBps,
        uint256 maintenanceMarginBps,
        uint256 maxLeverage,
        uint256 maxOpenInterest,
        uint256 maxAccountExposure,
        uint256 maxFundingRateBps
    ) external onlyOwner {
        require(!markets[marketId].active, "Market exists");
        require(initialMarginBps > 0 && initialMarginBps < BPS, "Bad initial");
        require(maintenanceMarginBps > 0 && maintenanceMarginBps < BPS, "Bad maintenance");
        require(initialMarginBps >= maintenanceMarginBps, "Initial < maintenance");
        require(maxLeverage >= 1, "Bad leverage");
        markets[marketId] = Market({
            active: true,
            initialMarginBps: initialMarginBps,
            maintenanceMarginBps: maintenanceMarginBps,
            maxLeverage: maxLeverage,
            maxOpenInterest: maxOpenInterest,
            maxAccountExposure: maxAccountExposure,
            maxFundingRateBps: maxFundingRateBps,
            openInterest: 0,
            longSize: 0,
            shortSize: 0,
            cumulativeFundingRate: 0,
            fundingRatePerSecond: 0,
            lastFundingTime: block.timestamp
        });
        emit MarketCreated(marketId, initialMarginBps, maintenanceMarginBps, maxLeverage, maxFundingRateBps);
    }

    function updateMarket(
        bytes32 marketId,
        uint256 initialMarginBps,
        uint256 maintenanceMarginBps,
        uint256 maxLeverage,
        uint256 maxOpenInterest,
        uint256 maxAccountExposure,
        uint256 maxFundingRateBps,
        bool active
    ) external onlyOwner {
        Market storage market = markets[marketId];
        require(market.active || active, "Market inactive");
        market.active = active;
        market.initialMarginBps = initialMarginBps;
        market.maintenanceMarginBps = maintenanceMarginBps;
        market.maxLeverage = maxLeverage;
        market.maxOpenInterest = maxOpenInterest;
        market.maxAccountExposure = maxAccountExposure;
        market.maxFundingRateBps = maxFundingRateBps;
        emit MarketUpdated(marketId);
        emit FundingConfigUpdated(marketId, maxFundingRateBps);
    }

    function setFundingRate(bytes32 marketId, int256 ratePerSecond) external onlyOwner {
        Market storage market = markets[marketId];
        if (!market.active) revert MarketInactive();
        _updateFunding(marketId);
        market.fundingRatePerSecond = ratePerSecond;
        emit FundingRateUpdated(marketId, ratePerSecond, market.cumulativeFundingRate);
    }

    function updateFundingRate(bytes32 marketId) external onlyFundingKeeper {
        Market storage market = markets[marketId];
        if (!market.active) revert MarketInactive();
        _updateFunding(marketId);

        uint256 price = _getPrice(marketId);
        uint256 longNotional = (market.longSize * price) / ONE;
        uint256 shortNotional = (market.shortSize * price) / ONE;
        uint256 total = longNotional + shortNotional;
        if (total == 0 || market.maxFundingRateBps == 0) {
            market.fundingRatePerSecond = 0;
            emit FundingRateUpdated(marketId, 0, market.cumulativeFundingRate);
            return;
        }

        int256 imbalance = (int256(longNotional) - int256(shortNotional)) * int256(ONE) / int256(total);
        int256 maxRate = int256((market.maxFundingRateBps * ONE) / BPS / SECONDS_PER_HOUR);
        int256 rate = (imbalance * maxRate) / int256(ONE);
        if (rate > maxRate) rate = maxRate;
        if (rate < -maxRate) rate = -maxRate;

        market.fundingRatePerSecond = rate;
        emit FundingRateUpdated(marketId, rate, market.cumulativeFundingRate);
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        uint256 internalAmount = _scaleUp(amount);
        collateralBalance[msg.sender] += internalAmount;
        emit Deposit(msg.sender, amount, internalAmount);
    }

    function depositFor(address account, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0 || account == address(0)) revert InvalidAmount();
        require(msg.sender == vault || msg.sender == insuranceFund || msg.sender == owner(), "Not allocator");
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        uint256 internalAmount = _scaleUp(amount);
        collateralBalance[account] += internalAmount;
        emit Deposit(account, amount, internalAmount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        uint256 internalAmount = _scaleUp(amount);
        if (collateralBalance[msg.sender] < internalAmount) revert InsufficientCollateral();

        (int256 equity, uint256 initialReq, ) = _accountMetrics(msg.sender);
        int256 equityAfter = equity - int256(internalAmount);
        require(equityAfter >= int256(initialReq), "Margin");

        collateralBalance[msg.sender] -= internalAmount;
        collateral.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, internalAmount);
    }

    function coverBadDebt(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        uint256 internalAmount = _scaleUp(amount);
        if (internalAmount >= badDebt) {
            internalAmount -= badDebt;
            badDebt = 0;
        } else {
            badDebt -= internalAmount;
            internalAmount = 0;
        }
        collateralBalance[msg.sender] += internalAmount;
        emit BadDebtCovered(amount);
    }

    function getAccountMarkets(address account) external view returns (bytes32[] memory) {
        return accountMarkets[account];
    }

    function applyTrade(FillSettlement calldata fill) external nonReentrant whenNotPaused onlyOrderbook {
        if (fill.sizeDelta == 0) revert InvalidAmount();
        Market storage market = markets[fill.marketId];
        if (!market.active) revert MarketInactive();
        if (fill.price == 0) revert InvalidAmount();

        _updateFunding(fill.marketId);
        Position storage position = positions[fill.account][fill.marketId];
        _applyFunding(fill.account, position, market);

        int256 prevSize = position.size;
        uint256 prevEntry = position.entryPrice;
        uint256 prevNotional = _positionNotional(prevSize, prevEntry);

        uint256 absDelta = _abs(fill.sizeDelta);
        uint256 notionalDelta = (absDelta * fill.price) / ONE;

        int256 realized = 0;
        if (prevSize == 0 || _sameSide(prevSize, fill.sizeDelta)) {
            uint256 newNotional = prevNotional + notionalDelta;
            int256 newSize = prevSize + fill.sizeDelta;
            uint256 newSizeAbs = _abs(newSize);
            position.size = newSize;
            position.entryPrice = newSizeAbs == 0 ? 0 : (newNotional * ONE) / newSizeAbs;
            position.fundingEntry = market.cumulativeFundingRate;
        } else {
            (int256 newSize, uint256 newEntry, int256 pnl) = _reduceOrFlip(prevSize, prevEntry, fill.sizeDelta, fill.price);
            realized = pnl;
            position.size = newSize;
            position.entryPrice = newEntry;
            position.fundingEntry = position.size == 0 ? 0 : market.cumulativeFundingRate;
        }

        if (realized != 0) {
            _applyRealizedPnl(fill.account, realized);
        }

        if (fill.feeBps > 0 && notionalDelta > 0) {
            _chargeFee(fill.account, notionalDelta, fill.feeBps);
        }

        uint256 newNotional = _positionNotional(position.size, position.entryPrice);
        if (newNotional != prevNotional) {
            market.openInterest = market.openInterest + newNotional - prevNotional;
            if (market.maxOpenInterest > 0) {
                require(market.openInterest <= market.maxOpenInterest, "OI cap");
            }
        }

        _updateSideSizes(market, prevSize, position.size);
        _syncAccountMarket(fill.account, fill.marketId, prevSize, position.size);

        if (market.maxAccountExposure > 0 && position.size != 0) {
            uint256 exposure = _positionNotional(position.size, _getPrice(fill.marketId));
            require(exposure <= market.maxAccountExposure, "Exposure cap");
        }

        _assertInitialMargin(fill.account);

        if (prevSize == 0 && position.size != 0) {
            emit PositionOpened(fill.account, fill.marketId, position.size, position.entryPrice);
        } else if (position.size == 0 && prevSize != 0) {
            emit PositionClosed(fill.account, fill.marketId, prevSize, fill.price, realized);
        } else {
            emit PositionUpdated(fill.account, fill.marketId, position.size, position.entryPrice, realized);
        }
    }

    function liquidate(address account, bytes32 marketId, uint256 sizeAbs) external nonReentrant whenNotPaused {
        Position storage position = positions[account][marketId];
        if (position.size == 0) revert InvalidAmount();

        (int256 equity, , uint256 maintenanceReq) = _accountMetrics(account);
        if (equity >= int256(maintenanceReq)) revert NotLiquidatable();

        Market storage market = markets[marketId];
        _updateFunding(marketId);
        _applyFunding(account, position, market);

        uint256 price = _getPrice(marketId);
        uint256 absPos = _abs(position.size);
        uint256 closeAbs = sizeAbs == 0 ? absPos : sizeAbs;
        require(closeAbs <= absPos, "Size too large");

        int256 closeSize = position.size > 0 ? int256(closeAbs) : -int256(closeAbs);
        int256 pnl = _pnl(closeSize, position.entryPrice, price);

        int256 prevSize = position.size;
        uint256 prevNotional = _positionNotional(prevSize, position.entryPrice);
        int256 remaining = prevSize - closeSize;
        position.size = remaining;
        if (remaining == 0) {
            position.entryPrice = 0;
            position.fundingEntry = 0;
        }

        _applyRealizedPnl(account, pnl);

        uint256 penalty = (closeAbs * price) / ONE;
        penalty = (penalty * liquidationFeeBps) / BPS;
        uint256 available = collateralBalance[account];
        uint256 paid = penalty > available ? available : penalty;
        if (paid > 0) {
            collateralBalance[account] -= paid;
            collateralBalance[msg.sender] += paid;
        }

        uint256 newNotional = _positionNotional(position.size, position.entryPrice);
        market.openInterest = market.openInterest + newNotional - prevNotional;
        _updateSideSizes(market, prevSize, position.size);
        _syncAccountMarket(account, marketId, prevSize, position.size);

        if (position.size == 0) {
            emit PositionClosed(account, marketId, closeSize, price, pnl);
        }

        emit LiquidationExecuted(account, msg.sender, marketId, closeSize, price, pnl, paid);
    }

    function adlClose(address account, bytes32 marketId, uint256 sizeAbs) external nonReentrant whenNotPaused onlyAdlKeeper {
        if (!adlEnabled) revert AdlDisabled();
        Position storage position = positions[account][marketId];
        if (position.size == 0) revert InvalidAmount();

        _updateFunding(marketId);
        Market storage market = markets[marketId];
        _applyFunding(account, position, market);

        uint256 price = _getPrice(marketId);
        uint256 absPos = _abs(position.size);
        uint256 closeAbs = sizeAbs == 0 ? absPos : sizeAbs;
        require(closeAbs <= absPos, "Size too large");

        int256 closeSize = position.size > 0 ? int256(closeAbs) : -int256(closeAbs);
        int256 pnl = _pnl(closeSize, position.entryPrice, price);

        int256 prevSize = position.size;
        uint256 prevNotional = _positionNotional(prevSize, position.entryPrice);
        int256 remaining = prevSize - closeSize;
        position.size = remaining;
        if (remaining == 0) {
            position.entryPrice = 0;
            position.fundingEntry = 0;
        }

        _applyRealizedPnl(account, pnl);

        uint256 newNotional = _positionNotional(position.size, position.entryPrice);
        market.openInterest = market.openInterest + newNotional - prevNotional;
        _updateSideSizes(market, prevSize, position.size);
        _syncAccountMarket(account, marketId, prevSize, position.size);

        emit AdlExecuted(account, marketId, closeSize, price, pnl);
    }

    function _coverDeficit(address account, uint256 deficit) internal {
        if (deficit == 0) return;
        uint256 insurance = collateralBalance[insuranceFund];
        if (insurance >= deficit) {
            collateralBalance[insuranceFund] -= deficit;
            collateralBalance[account] += deficit;
            return;
        }
        if (insurance > 0) {
            collateralBalance[insuranceFund] = 0;
            collateralBalance[account] += insurance;
            deficit -= insurance;
        }
        badDebt += deficit;
        emit BadDebtIncreased(deficit);
        if (!adlEnabled) {
            adlEnabled = true;
            emit AdlToggled(true);
        }
    }

    function _chargeFee(address account, uint256 notional, uint256 feeBps) internal {
        uint256 fee = (notional * feeBps) / BPS;
        if (fee == 0) return;
        require(collateralBalance[account] >= fee, "Fee balance");
        collateralBalance[account] -= fee;
        if (vault != address(0) && vaultFeeShareBps > 0) {
            collateralBalance[vault] += (fee * vaultFeeShareBps) / BPS;
        }
        if (insuranceFund != address(0) && insuranceFeeShareBps > 0) {
            collateralBalance[insuranceFund] += (fee * insuranceFeeShareBps) / BPS;
        }
        if (treasury != address(0) && treasuryFeeShareBps > 0) {
            collateralBalance[treasury] += (fee * treasuryFeeShareBps) / BPS;
        }
    }

    function _applyRealizedPnl(address account, int256 pnl) internal {
        if (pnl == 0) return;
        if (pnl > 0) {
            collateralBalance[account] += uint256(pnl);
            return;
        }
        uint256 loss = uint256(-pnl);
        if (collateralBalance[account] >= loss) {
            collateralBalance[account] -= loss;
            return;
        }
        uint256 deficit = loss - collateralBalance[account];
        collateralBalance[account] = 0;
        _coverDeficit(account, deficit);
    }

    function _accountMetrics(address account) internal view returns (int256 equity, uint256 initialReq, uint256 maintenanceReq) {
        bytes32[] storage marketsList = accountMarkets[account];
        int256 totalPnl = 0;
        for (uint256 i = 0; i < marketsList.length; i++) {
            bytes32 marketId = marketsList[i];
            Position storage position = positions[account][marketId];
            if (position.size == 0) continue;
            Market storage market = markets[marketId];
            if (!market.active) continue;
            uint256 price = _getPrice(marketId);
            uint256 notional = (_abs(position.size) * price) / ONE;
            initialReq += (notional * market.initialMarginBps) / BPS;
            maintenanceReq += (notional * market.maintenanceMarginBps) / BPS;
            totalPnl += _pnl(position.size, position.entryPrice, price);
        }
        equity = int256(collateralBalance[account]) + totalPnl;
    }

    function _assertInitialMargin(address account) internal view {
        (int256 equity, uint256 initialReq, ) = _accountMetrics(account);
        require(equity >= int256(initialReq), "Initial margin");
    }

    function _syncAccountMarket(address account, bytes32 marketId, int256 prevSize, int256 nextSize) internal {
        bool had = prevSize != 0;
        bool has = nextSize != 0;
        if (!had && has) {
            accountMarketIndex[account][marketId] = accountMarkets[account].length + 1;
            accountMarkets[account].push(marketId);
        } else if (had && !has) {
            uint256 index = accountMarketIndex[account][marketId];
            if (index > 0) {
                uint256 idx = index - 1;
                uint256 lastIdx = accountMarkets[account].length - 1;
                if (idx != lastIdx) {
                    bytes32 lastMarket = accountMarkets[account][lastIdx];
                    accountMarkets[account][idx] = lastMarket;
                    accountMarketIndex[account][lastMarket] = index;
                }
                accountMarkets[account].pop();
                delete accountMarketIndex[account][marketId];
            }
        }
    }

    function _updateSideSizes(Market storage market, int256 prevSize, int256 nextSize) internal {
        if (prevSize > 0) {
            market.longSize -= _abs(prevSize);
        } else if (prevSize < 0) {
            market.shortSize -= _abs(prevSize);
        }

        if (nextSize > 0) {
            market.longSize += _abs(nextSize);
        } else if (nextSize < 0) {
            market.shortSize += _abs(nextSize);
        }
    }

    function _reduceOrFlip(
        int256 prevSize,
        uint256 prevEntry,
        int256 sizeDelta,
        uint256 price
    ) internal pure returns (int256 newSize, uint256 newEntry, int256 pnl) {
        uint256 absPrev = _abs(prevSize);
        uint256 absDelta = _abs(sizeDelta);
        if (absDelta < absPrev) {
            int256 closedSize = prevSize > 0 ? int256(absDelta) : -int256(absDelta);
            pnl = _pnl(closedSize, prevEntry, price);
            newSize = prevSize + sizeDelta;
            newEntry = prevEntry;
            return (newSize, newEntry, pnl);
        }
        if (absDelta == absPrev) {
            pnl = _pnl(prevSize, prevEntry, price);
            return (0, 0, pnl);
        }
        pnl = _pnl(prevSize, prevEntry, price);
        int256 remaining = prevSize + sizeDelta;
        newSize = remaining;
        newEntry = price;
    }

    function _updateFunding(bytes32 marketId) internal {
        Market storage market = markets[marketId];
        if (!market.active || market.lastFundingTime == 0) {
            market.lastFundingTime = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - market.lastFundingTime;
        if (elapsed == 0) return;
        market.cumulativeFundingRate += market.fundingRatePerSecond * int256(elapsed);
        market.lastFundingTime = block.timestamp;
    }

    function _applyFunding(address account, Position storage position, Market storage market) internal {
        if (position.size == 0) {
            position.fundingEntry = market.cumulativeFundingRate;
            return;
        }
        int256 payment = (position.size * (market.cumulativeFundingRate - position.fundingEntry)) / int256(ONE);
        if (payment > 0) {
            uint256 debit = uint256(payment);
            if (collateralBalance[account] >= debit) {
                collateralBalance[account] -= debit;
            } else {
                uint256 deficit = debit - collateralBalance[account];
                collateralBalance[account] = 0;
                _coverDeficit(account, deficit);
            }
        } else if (payment < 0) {
            collateralBalance[account] += uint256(-payment);
        }
        position.fundingEntry = market.cumulativeFundingRate;
    }

    function _getPrice(bytes32 marketId) internal view returns (uint256) {
        (uint256 price, uint256 updatedAt) = oracleRouter.getPriceData(marketId);
        if (price == 0 || updatedAt == 0) revert InvalidAmount();
        if (maxPriceAge > 0 && block.timestamp - updatedAt > maxPriceAge) revert StalePrice();
        return price;
    }

    function _positionNotional(int256 size, uint256 price) internal pure returns (uint256) {
        if (size == 0 || price == 0) return 0;
        return (_abs(size) * price) / ONE;
    }

    function _scaleUp(uint256 amount) internal pure returns (uint256) {
        return amount * SCALE;
    }

    function _abs(int256 value) internal pure returns (uint256) {
        return uint256(value >= 0 ? value : -value);
    }

    function _sameSide(int256 a, int256 b) internal pure returns (bool) {
        return (a >= 0 && b >= 0) || (a <= 0 && b <= 0);
    }

    function _pnl(int256 size, uint256 entryPrice, uint256 price) internal pure returns (int256) {
        int256 diff = int256(price) - int256(entryPrice);
        return (diff * size) / int256(ONE);
    }
}
