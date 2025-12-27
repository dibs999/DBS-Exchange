// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOracleRouter {
    function getPriceData(bytes32 marketId) external view returns (uint256 price, uint256 updatedAt);
}

interface IPerpEngineV2 {
    struct FillSettlement {
        address account;
        bytes32 marketId;
        int256 sizeDelta;
        uint256 price;
        bool isMaker;
        uint256 feeBps;
    }

    function applyTrade(FillSettlement calldata fill) external;
    function oracle() external view returns (address);
    function maxPriceAge() external view returns (uint256);
}

contract OrderbookV2 is Ownable, Pausable, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    enum OrderStatus { None, Live, QueuedForAuction, Filled, Cancelled }
    enum OrderMode { Continuous, Batch }

    struct MarketConfig {
        bool active;
        uint256 tickSize;
        uint256 minSize;
        uint256 maxSize;
        uint256 auctionInterval;
        uint256 lastAuctionTs;
    }

    struct Order {
        address owner;
        bytes32 marketId;
        int256 size;
        uint256 price;
        OrderMode mode;
        OrderStatus status;
        uint64 createdAt;
        uint64 lastUpdateAt;
    }

    struct AuctionFill {
        uint256 orderId;
        uint256 price;
        int256 size;
        bool isMaker;
    }

    uint256 public constant ONE = 1e18;

    IPerpEngineV2 public engine;
    uint256 public nextOrderId = 1;
    uint256 public makerFeeBps = 1;
    uint256 public takerFeeBps = 6;

    mapping(bytes32 => MarketConfig) public markets;
    mapping(uint256 => Order) public orders;
    mapping(address => bool) public keepers;

    event MarketConfigured(bytes32 indexed marketId, uint256 tickSize, uint256 minSize, uint256 maxSize, uint256 auctionInterval);
    event KeeperSet(address indexed keeper, bool allowed);
    event EngineUpdated(address indexed engine);
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed owner,
        bytes32 indexed marketId,
        int256 size,
        uint256 price,
        OrderMode mode
    );
    event OrderCancelled(uint256 indexed orderId, address indexed owner);
    event OrderQueued(uint256 indexed orderId, bytes32 indexed marketId);
    event OrderFilled(uint256 indexed orderId, bytes32 indexed marketId, int256 size, uint256 price, bool isMaker);
    event AuctionExecuted(bytes32 indexed marketId, uint256 clearingPrice, uint256 ordersTouched);
    event FeesUpdated(uint256 makerFeeBps, uint256 takerFeeBps);

    constructor(address engine_) Ownable(msg.sender) {
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngineV2(engine_);
    }

    modifier onlyKeeper() {
        require(keepers[msg.sender], "Not keeper");
        _;
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setEngine(address engine_) external onlyOwner {
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngineV2(engine_);
        emit EngineUpdated(engine_);
    }

    function setMarket(
        bytes32 marketId,
        uint256 tickSize,
        uint256 minSize,
        uint256 maxSize,
        uint256 auctionInterval
    ) external onlyOwner {
        require(tickSize > 0, "tick=0");
        require(minSize > 0, "min=0");
        markets[marketId] = MarketConfig({
            active: true,
            tickSize: tickSize,
            minSize: minSize,
            maxSize: maxSize,
            auctionInterval: auctionInterval,
            lastAuctionTs: markets[marketId].lastAuctionTs
        });
        emit MarketConfigured(marketId, tickSize, minSize, maxSize, auctionInterval);
    }

    function setFees(uint256 makerBps, uint256 takerBps) external onlyOwner {
        require(makerBps <= BPS, "maker too high");
        require(takerBps <= BPS, "taker too high");
        makerFeeBps = makerBps;
        takerFeeBps = takerBps;
        emit FeesUpdated(makerBps, takerBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function placeOrder(
        bytes32 marketId,
        int256 size,
        uint256 price,
        OrderMode mode
    ) external whenNotPaused returns (uint256) {
        MarketConfig memory cfg = markets[marketId];
        require(cfg.active, "inactive market");
        _validateSize(cfg, size);
        if (mode == OrderMode.Continuous) {
            require(price > 0, "price=0");
            _validatePrice(cfg, price);
        }

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender,
            marketId: marketId,
            size: size,
            price: price,
            mode: mode,
            status: mode == OrderMode.Batch ? OrderStatus.QueuedForAuction : OrderStatus.Live,
            createdAt: uint64(block.timestamp),
            lastUpdateAt: uint64(block.timestamp)
        });

        emit OrderPlaced(orderId, msg.sender, marketId, size, price, mode);
        if (mode == OrderMode.Batch) {
            emit OrderQueued(orderId, marketId);
        }
        return orderId;
    }

    function cancelOrder(uint256 orderId) external whenNotPaused {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Live || order.status == OrderStatus.QueuedForAuction, "Inactive");
        require(order.owner == msg.sender, "Not owner");
        order.status = OrderStatus.Cancelled;
        order.lastUpdateAt = uint64(block.timestamp);
        emit OrderCancelled(orderId, msg.sender);
    }

    function queueForAuction(uint256 orderId) external whenNotPaused {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Live, "Not live");
        require(order.owner == msg.sender, "Not owner");
        order.status = OrderStatus.QueuedForAuction;
        order.lastUpdateAt = uint64(block.timestamp);
        emit OrderQueued(orderId, order.marketId);
    }

    function executeAuction(
        bytes32 marketId,
        uint256 clearingPrice,
        AuctionFill[] calldata fills
    ) external nonReentrant whenNotPaused onlyKeeper {
        MarketConfig storage cfg = markets[marketId];
        require(cfg.active, "inactive market");
        require(clearingPrice > 0, "price=0");
        _validatePrice(cfg, clearingPrice);

        uint256 priceAge = engine.maxPriceAge();
        if (priceAge > 0) {
            (uint256 oraclePrice, uint256 updatedAt) = IOracleRouter(engine.oracle()).getPriceData(marketId);
            require(oraclePrice > 0 && updatedAt > 0, "No price");
            require(block.timestamp - updatedAt <= priceAge, "Stale price");
        }

        for (uint256 i = 0; i < fills.length; i++) {
            AuctionFill calldata fill = fills[i];
            Order storage order = orders[fill.orderId];
            require(order.marketId == marketId, "market mismatch");
            require(order.status == OrderStatus.QueuedForAuction || order.status == OrderStatus.Live, "Bad status");
            require(fill.price == clearingPrice, "clearing mismatch");
            _validateSize(cfg, fill.size);
            _validatePrice(cfg, fill.price);
            require(_sameSide(order.size, fill.size), "Fill direction");
            require(_abs(fill.size) <= _abs(order.size), "Fill too large");

            engine.applyTrade(
                IPerpEngineV2.FillSettlement({
                    account: order.owner,
                    marketId: order.marketId,
                    sizeDelta: fill.size,
                    price: fill.price,
                    isMaker: fill.isMaker,
                    feeBps: fill.isMaker ? makerFeeBps : takerFeeBps
                })
            );

            order.size -= fill.size;
            order.lastUpdateAt = uint64(block.timestamp);
            if (order.size == 0) {
                order.status = OrderStatus.Filled;
            }
            emit OrderFilled(fill.orderId, marketId, fill.size, fill.price, fill.isMaker);
        }

        cfg.lastAuctionTs = block.timestamp;
        emit AuctionExecuted(marketId, clearingPrice, fills.length);
    }

    function _validatePrice(MarketConfig memory cfg, uint256 price) internal pure {
        require(price % cfg.tickSize == 0, "Tick");
    }

    function _validateSize(MarketConfig memory cfg, int256 size) internal pure {
        require(size != 0, "size=0");
        uint256 absSize = _abs(size);
        require(absSize >= cfg.minSize, "min size");
        if (cfg.maxSize > 0) {
            require(absSize <= cfg.maxSize, "max size");
        }
    }

    function _abs(int256 value) internal pure returns (uint256) {
        return uint256(value >= 0 ? value : -value);
    }

    function _sameSide(int256 a, int256 b) internal pure returns (bool) {
        return (a >= 0 && b >= 0) || (a <= 0 && b <= 0);
    }
}
