// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

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
    function oracleRouter() external view returns (address);
    function maxPriceAge() external view returns (uint256);
}

contract OrderbookV2 is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    uint256 public constant BPS = 10_000;
    uint256 public constant ONE = 1e18;

    enum OrderStatus { None, Live, QueuedForAuction, TriggerPending, Filled, Cancelled }
    enum OrderMode { Continuous, Batch }
    enum OrderType { Market, Limit, Stop }

    struct MarketConfig {
        bool active;
        uint256 tickSize;
        uint256 minSize;
        uint256 maxSize;
        uint256 auctionInterval;
        uint256 lastAuctionTs;
        uint256 maxAuctionOrders;
        bool vaultEnabled;
    }

    struct Order {
        address owner;
        bytes32 marketId;
        int256 size;
        uint256 price;
        uint256 triggerPrice;
        OrderMode mode;
        OrderType orderType;
        OrderStatus status;
        uint256 next;
        uint64 createdAt;
        uint64 lastUpdateAt;
    }

    struct PriceLevel {
        uint256 head;
        uint256 tail;
        uint256 totalSize;
        uint256 next;
        uint256 prev;
        bool exists;
    }

    IPerpEngineV2 public engine;
    address public vault;
    uint256 public nextOrderId;
    uint256 public makerFeeBps;
    uint256 public takerFeeBps;

    mapping(bytes32 => MarketConfig) public markets;
    mapping(uint256 => Order) public orders;
    mapping(address => bool) public keepers;

    mapping(bytes32 => uint256) public bestBid;
    mapping(bytes32 => uint256) public bestAsk;
    mapping(bytes32 => mapping(uint256 => PriceLevel)) internal bidLevels;
    mapping(bytes32 => mapping(uint256 => PriceLevel)) internal askLevels;
    mapping(bytes32 => uint256[]) internal auctionQueue;

    event MarketConfigured(bytes32 indexed marketId, uint256 tickSize, uint256 minSize, uint256 maxSize, uint256 auctionInterval);
    event KeeperSet(address indexed keeper, bool allowed);
    event EngineUpdated(address indexed engine);
    event VaultUpdated(address indexed vault);
    event FeesUpdated(uint256 makerFeeBps, uint256 takerFeeBps);
    event OrderPlaced(
        uint256 indexed orderId,
        address indexed owner,
        bytes32 indexed marketId,
        int256 size,
        uint256 price,
        OrderMode mode,
        OrderType orderType
    );
    event OrderCancelled(uint256 indexed orderId, address indexed owner);
    event OrderQueued(uint256 indexed orderId, bytes32 indexed marketId);
    event OrderMatched(uint256 indexed orderId, bytes32 indexed marketId, int256 size, uint256 price, bool isMaker);
    event AuctionExecuted(bytes32 indexed marketId, uint256 clearingPrice, uint256 ordersTouched);

    modifier onlyKeeper() {
        require(keepers[msg.sender], "Not keeper");
        _;
    }

    function initialize(address engine_, address vault_) external initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngineV2(engine_);
        vault = vault_;
        nextOrderId = 1;
        makerFeeBps = 1;
        takerFeeBps = 6;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setEngine(address engine_) external onlyOwner {
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngineV2(engine_);
        emit EngineUpdated(engine_);
    }

    function setVault(address vault_) external onlyOwner {
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function setMarket(
        bytes32 marketId,
        uint256 tickSize,
        uint256 minSize,
        uint256 maxSize,
        uint256 auctionInterval,
        uint256 maxAuctionOrders,
        bool vaultEnabled
    ) external onlyOwner {
        require(tickSize > 0, "tick=0");
        require(minSize > 0, "min=0");
        markets[marketId] = MarketConfig({
            active: true,
            tickSize: tickSize,
            minSize: minSize,
            maxSize: maxSize,
            auctionInterval: auctionInterval,
            lastAuctionTs: markets[marketId].lastAuctionTs,
            maxAuctionOrders: maxAuctionOrders,
            vaultEnabled: vaultEnabled
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
        OrderMode mode,
        OrderType orderType,
        uint256 triggerPrice
    ) external whenNotPaused returns (uint256) {
        MarketConfig memory cfg = markets[marketId];
        require(cfg.active, "inactive market");
        _validateSize(cfg, size);

        if (orderType == OrderType.Market) {
            require(mode == OrderMode.Continuous, "Market only continuous");
            require(price == 0 && triggerPrice == 0, "Bad market");
        } else if (orderType == OrderType.Limit) {
            require(price > 0, "price=0");
            require(triggerPrice == 0, "trigger=0");
            _validatePrice(cfg, price);
        } else {
            require(triggerPrice > 0, "trigger=0");
            if (price > 0) {
                _validatePrice(cfg, price);
            } else {
                require(mode == OrderMode.Continuous, "Stop market only continuous");
            }
        }

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender,
            marketId: marketId,
            size: size,
            price: price,
            triggerPrice: triggerPrice,
            mode: mode,
            orderType: orderType,
            status: OrderStatus.Live,
            next: 0,
            createdAt: uint64(block.timestamp),
            lastUpdateAt: uint64(block.timestamp)
        });

        emit OrderPlaced(orderId, msg.sender, marketId, size, price, mode, orderType);

        if (orderType == OrderType.Stop) {
            orders[orderId].status = OrderStatus.TriggerPending;
            return orderId;
        }

        if (mode == OrderMode.Batch) {
            orders[orderId].status = OrderStatus.QueuedForAuction;
            auctionQueue[marketId].push(orderId);
            emit OrderQueued(orderId, marketId);
            return orderId;
        }

        _executeContinuous(orderId, cfg);
        return orderId;
    }

    function cancelOrder(uint256 orderId) external whenNotPaused {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Live || order.status == OrderStatus.QueuedForAuction || order.status == OrderStatus.TriggerPending, "Inactive");
        require(order.owner == msg.sender, "Not owner");
        if (order.status == OrderStatus.Live) {
            _removeFromBook(orderId, order);
        }
        order.status = OrderStatus.Cancelled;
        order.lastUpdateAt = uint64(block.timestamp);
        emit OrderCancelled(orderId, msg.sender);
    }

    function triggerStopOrder(uint256 orderId) external whenNotPaused onlyKeeper {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.TriggerPending, "Not pending");
        MarketConfig memory cfg = markets[order.marketId];
        require(cfg.active, "inactive market");

        uint256 price = _getOraclePrice(order.marketId);
        if (order.size > 0) {
            require(price >= order.triggerPrice, "Stop not reached");
        } else {
            require(price <= order.triggerPrice, "Stop not reached");
        }

        order.status = OrderStatus.Live;
        order.lastUpdateAt = uint64(block.timestamp);

        if (order.mode == OrderMode.Batch) {
            order.status = OrderStatus.QueuedForAuction;
            auctionQueue[order.marketId].push(orderId);
            emit OrderQueued(orderId, order.marketId);
            return;
        }

        if (order.price == 0) {
            order.orderType = OrderType.Market;
        } else {
            order.orderType = OrderType.Limit;
        }
        _executeContinuous(orderId, cfg);
    }

    function executeAuction(bytes32 marketId) external nonReentrant whenNotPaused onlyKeeper {
        MarketConfig storage cfg = markets[marketId];
        require(cfg.active, "inactive market");
        if (cfg.auctionInterval > 0) {
            require(block.timestamp >= cfg.lastAuctionTs + cfg.auctionInterval, "Auction cooldown");
        }

        uint256[] storage queue = auctionQueue[marketId];
        uint256 maxOrders = cfg.maxAuctionOrders == 0 ? queue.length : cfg.maxAuctionOrders;
        if (maxOrders == 0) return;

        uint256[] memory eligible = new uint256[](maxOrders);
        uint256 count = 0;
        for (uint256 i = 0; i < queue.length && count < maxOrders; i++) {
            uint256 orderId = queue[i];
            if (orders[orderId].status != OrderStatus.QueuedForAuction) continue;
            eligible[count++] = orderId;
        }
        if (count == 0) return;

        uint256 clearingPrice = _computeClearingPrice(marketId, eligible, count);
        _validatePrice(cfg, clearingPrice);

        (uint256 buyTotal, uint256 sellTotal) = _aggregateAuctionVolumes(marketId, eligible, count, clearingPrice);
        uint256 matched = buyTotal < sellTotal ? buyTotal : sellTotal;
        uint256 remainingBuy = matched;
        uint256 remainingSell = matched;

        uint256 touched = 0;
        for (uint256 i = 0; i < count; i++) {
            uint256 orderId = eligible[i];
            Order storage order = orders[orderId];
            if (order.status != OrderStatus.QueuedForAuction) continue;
            if (order.size > 0 && order.price < clearingPrice) continue;
            if (order.size < 0 && order.price > clearingPrice) continue;

            uint256 absSize = _abs(order.size);
            uint256 fillAbs = 0;
            if (order.size > 0 && remainingBuy > 0) {
                fillAbs = absSize > remainingBuy ? remainingBuy : absSize;
                remainingBuy -= fillAbs;
            } else if (order.size < 0 && remainingSell > 0) {
                fillAbs = absSize > remainingSell ? remainingSell : absSize;
                remainingSell -= fillAbs;
            }

            if (fillAbs == 0) continue;

            int256 orderFill = order.size > 0 ? int256(fillAbs) : -int256(fillAbs);
            _settleAuctionFill(orderId, order, orderFill, clearingPrice, true);
            touched++;
        }

        if (cfg.vaultEnabled && vault != address(0)) {
            uint256 residualBuy = buyTotal > sellTotal ? buyTotal - sellTotal : 0;
            uint256 residualSell = sellTotal > buyTotal ? sellTotal - buyTotal : 0;
            if (residualBuy > 0 || residualSell > 0) {
                _fillWithVault(marketId, eligible, count, clearingPrice, residualBuy, residualSell);
            }
        }

        cfg.lastAuctionTs = block.timestamp;
        emit AuctionExecuted(marketId, clearingPrice, touched);
    }

    function _executeContinuous(uint256 orderId, MarketConfig memory cfg) internal {
        Order storage order = orders[orderId];
        int256 remaining = order.size;
        bool isBuy = remaining > 0;

        uint256 bestPrice = isBuy ? bestAsk[order.marketId] : bestBid[order.marketId];
        while (remaining != 0 && bestPrice != 0) {
            if (order.orderType == OrderType.Limit) {
                if (isBuy && bestPrice > order.price) break;
                if (!isBuy && bestPrice < order.price) break;
            }
            PriceLevel storage level = isBuy ? askLevels[order.marketId][bestPrice] : bidLevels[order.marketId][bestPrice];
            uint256 makerId = level.head;
            while (makerId != 0 && remaining != 0) {
                Order storage maker = orders[makerId];
                if (maker.status != OrderStatus.Live) {
                    makerId = maker.next;
                    continue;
                }
                uint256 fillAbs = _abs(remaining);
                uint256 makerAbs = _abs(maker.size);
                if (makerAbs < fillAbs) {
                    fillAbs = makerAbs;
                }

                int256 makerFill = maker.size > 0 ? int256(fillAbs) : -int256(fillAbs);
                int256 takerFill = -makerFill;

                _settleContinuousFill(orderId, makerId, order, maker, takerFill, makerFill, bestPrice);

                maker.size -= makerFill;
                remaining -= takerFill;
                level.totalSize -= fillAbs;

                uint256 nextId = maker.next;
                if (maker.size == 0) {
                    maker.status = OrderStatus.Filled;
                    maker.lastUpdateAt = uint64(block.timestamp);
                    level.head = nextId;
                    if (nextId == 0) {
                        level.tail = 0;
                    }
                    maker.next = 0;
                }
                makerId = nextId;
            }

            if (level.head == 0) {
                _removeLevel(order.marketId, bestPrice, isBuy);
                bestPrice = isBuy ? bestAsk[order.marketId] : bestBid[order.marketId];
            } else {
                break;
            }
        }

        order.size = remaining;
        order.lastUpdateAt = uint64(block.timestamp);
        if (remaining == 0) {
            order.status = OrderStatus.Filled;
            return;
        }

        if (order.orderType == OrderType.Limit) {
            _addToBook(orderId, order.price, cfg);
            order.status = OrderStatus.Live;
        } else {
            order.status = OrderStatus.Cancelled;
            emit OrderCancelled(orderId, order.owner);
        }
    }

    function _settleContinuousFill(
        uint256 takerOrderId,
        uint256 makerOrderId,
        Order storage taker,
        Order storage maker,
        int256 takerFill,
        int256 makerFill,
        uint256 price
    ) internal {
        engine.applyTrade(
            IPerpEngineV2.FillSettlement({
                account: maker.owner,
                marketId: maker.marketId,
                sizeDelta: makerFill,
                price: price,
                isMaker: true,
                feeBps: makerFeeBps
            })
        );
        engine.applyTrade(
            IPerpEngineV2.FillSettlement({
                account: taker.owner,
                marketId: taker.marketId,
                sizeDelta: takerFill,
                price: price,
                isMaker: false,
                feeBps: takerFeeBps
            })
        );

        emit OrderMatched(makerOrderId, maker.marketId, makerFill, price, true);
        emit OrderMatched(takerOrderId, taker.marketId, takerFill, price, false);
    }

    function _settleAuctionFill(
        uint256 orderId,
        Order storage order,
        int256 fill,
        uint256 price,
        bool makerFee
    ) internal {
        engine.applyTrade(
            IPerpEngineV2.FillSettlement({
                account: order.owner,
                marketId: order.marketId,
                sizeDelta: fill,
                price: price,
                isMaker: makerFee,
                feeBps: makerFee ? makerFeeBps : takerFeeBps
            })
        );

        order.size -= fill;
        order.lastUpdateAt = uint64(block.timestamp);
        if (order.size == 0) {
            order.status = OrderStatus.Filled;
        }
        emit OrderMatched(orderId, order.marketId, fill, price, makerFee);
    }

    function _fillWithVault(
        bytes32 marketId,
        uint256[] memory eligible,
        uint256 count,
        uint256 price,
        uint256 residualBuy,
        uint256 residualSell
    ) internal {
        for (uint256 i = 0; i < count; i++) {
            uint256 orderId = eligible[i];
            Order storage order = orders[orderId];
            if (order.status != OrderStatus.QueuedForAuction) continue;
            if (order.size > 0 && order.price < price) continue;
            if (order.size < 0 && order.price > price) continue;

            uint256 absSize = _abs(order.size);
            uint256 fillAbs = 0;
            if (order.size > 0 && residualBuy > 0) {
                fillAbs = absSize > residualBuy ? residualBuy : absSize;
                residualBuy -= fillAbs;
                int256 orderFill = int256(fillAbs);
                int256 vaultFill = -orderFill;
                _settleVaultFill(orderId, order, orderFill, vaultFill, price);
            } else if (order.size < 0 && residualSell > 0) {
                fillAbs = absSize > residualSell ? residualSell : absSize;
                residualSell -= fillAbs;
                int256 orderFill = -int256(fillAbs);
                int256 vaultFill = -orderFill;
                _settleVaultFill(orderId, order, orderFill, vaultFill, price);
            }

            if (residualBuy == 0 && residualSell == 0) break;
        }
    }

    function _settleVaultFill(
        uint256 orderId,
        Order storage order,
        int256 orderFill,
        int256 vaultFill,
        uint256 price
    ) internal {
        engine.applyTrade(
            IPerpEngineV2.FillSettlement({
                account: vault,
                marketId: order.marketId,
                sizeDelta: vaultFill,
                price: price,
                isMaker: true,
                feeBps: makerFeeBps
            })
        );
        engine.applyTrade(
            IPerpEngineV2.FillSettlement({
                account: order.owner,
                marketId: order.marketId,
                sizeDelta: orderFill,
                price: price,
                isMaker: false,
                feeBps: takerFeeBps
            })
        );

        order.size -= orderFill;
        order.lastUpdateAt = uint64(block.timestamp);
        if (order.size == 0) {
            order.status = OrderStatus.Filled;
        }

        emit OrderMatched(orderId, order.marketId, orderFill, price, false);
    }

    function _computeClearingPrice(bytes32 marketId, uint256[] memory eligible, uint256 count) internal view returns (uint256) {
        uint256[] memory prices = new uint256[](count);
        uint256 priceCount = 0;
        for (uint256 i = 0; i < count; i++) {
            uint256 p = orders[eligible[i]].price;
            bool exists = false;
            for (uint256 j = 0; j < priceCount; j++) {
                if (prices[j] == p) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                prices[priceCount++] = p;
            }
        }

        uint256 bestPrice = prices[0];
        uint256 bestVolume = 0;
        uint256 oraclePrice = _getOraclePrice(marketId);
        for (uint256 i = 0; i < priceCount; i++) {
            uint256 candidate = prices[i];
            (uint256 buyTotal, uint256 sellTotal) = _aggregateAuctionVolumes(marketId, eligible, count, candidate);
            uint256 matched = buyTotal < sellTotal ? buyTotal : sellTotal;
            if (matched > bestVolume) {
                bestVolume = matched;
                bestPrice = candidate;
            } else if (matched == bestVolume) {
                uint256 diffBest = bestPrice > oraclePrice ? bestPrice - oraclePrice : oraclePrice - bestPrice;
                uint256 diffCandidate = candidate > oraclePrice ? candidate - oraclePrice : oraclePrice - candidate;
                if (diffCandidate < diffBest) {
                    bestPrice = candidate;
                }
            }
        }
        return bestPrice;
    }

    function _aggregateAuctionVolumes(
        bytes32,
        uint256[] memory eligible,
        uint256 count,
        uint256 price
    ) internal view returns (uint256 buyTotal, uint256 sellTotal) {
        for (uint256 i = 0; i < count; i++) {
            Order storage order = orders[eligible[i]];
            if (order.status != OrderStatus.QueuedForAuction) continue;
            if (order.size > 0 && order.price >= price) {
                buyTotal += _abs(order.size);
            } else if (order.size < 0 && order.price <= price) {
                sellTotal += _abs(order.size);
            }
        }
    }

    function _addToBook(uint256 orderId, uint256 price, MarketConfig memory cfg) internal {
        Order storage order = orders[orderId];
        bool isBuy = order.size > 0;
        _validatePrice(cfg, price);
        PriceLevel storage level = isBuy ? bidLevels[order.marketId][price] : askLevels[order.marketId][price];
        if (!level.exists) {
            _insertLevel(order.marketId, price, isBuy);
            level = isBuy ? bidLevels[order.marketId][price] : askLevels[order.marketId][price];
        }
        level.totalSize += _abs(order.size);
        if (level.head == 0) {
            level.head = orderId;
            level.tail = orderId;
        } else {
            orders[level.tail].next = orderId;
            level.tail = orderId;
        }
    }

    function _removeFromBook(uint256 orderId, Order storage order) internal {
        if (order.price == 0) return;
        bool isBuy = order.size > 0;
        PriceLevel storage level = isBuy ? bidLevels[order.marketId][order.price] : askLevels[order.marketId][order.price];
        if (level.head == 0) return;

        uint256 current = level.head;
        uint256 prev = 0;
        while (current != 0) {
            if (current == orderId) {
                uint256 next = orders[current].next;
                if (prev == 0) {
                    level.head = next;
                } else {
                    orders[prev].next = next;
                }
                if (current == level.tail) {
                    level.tail = prev;
                }
                orders[current].next = 0;
                level.totalSize -= _abs(order.size);
                if (level.head == 0) {
                    _removeLevel(order.marketId, order.price, isBuy);
                }
                return;
            }
            prev = current;
            current = orders[current].next;
        }
    }

    function _insertLevel(bytes32 marketId, uint256 price, bool isBid) internal {
        PriceLevel storage level = isBid ? bidLevels[marketId][price] : askLevels[marketId][price];
        require(!level.exists, "Level exists");
        level.exists = true;

        uint256 best = isBid ? bestBid[marketId] : bestAsk[marketId];
        if (best == 0) {
            if (isBid) {
                bestBid[marketId] = price;
            } else {
                bestAsk[marketId] = price;
            }
            return;
        }

        if (isBid) {
            if (price > best) {
                level.next = best;
                bidLevels[marketId][best].prev = price;
                bestBid[marketId] = price;
                return;
            }
            uint256 current = best;
            while (current != 0) {
                uint256 next = bidLevels[marketId][current].next;
                if (next == 0 || next < price) {
                    level.prev = current;
                    level.next = next;
                    bidLevels[marketId][current].next = price;
                    if (next != 0) {
                        bidLevels[marketId][next].prev = price;
                    }
                    return;
                }
                current = next;
            }
        } else {
            if (price < best) {
                level.next = best;
                askLevels[marketId][best].prev = price;
                bestAsk[marketId] = price;
                return;
            }
            uint256 current = best;
            while (current != 0) {
                uint256 next = askLevels[marketId][current].next;
                if (next == 0 || next > price) {
                    level.prev = current;
                    level.next = next;
                    askLevels[marketId][current].next = price;
                    if (next != 0) {
                        askLevels[marketId][next].prev = price;
                    }
                    return;
                }
                current = next;
            }
        }
    }

    function _removeLevel(bytes32 marketId, uint256 price, bool isBid) internal {
        PriceLevel storage level = isBid ? bidLevels[marketId][price] : askLevels[marketId][price];
        if (!level.exists) return;
        uint256 prev = level.prev;
        uint256 next = level.next;

        if (prev != 0) {
            if (isBid) {
                bidLevels[marketId][prev].next = next;
            } else {
                askLevels[marketId][prev].next = next;
            }
        } else {
            if (isBid) {
                bestBid[marketId] = next;
            } else {
                bestAsk[marketId] = next;
            }
        }

        if (next != 0) {
            if (isBid) {
                bidLevels[marketId][next].prev = prev;
            } else {
                askLevels[marketId][next].prev = prev;
            }
        }

        if (isBid) {
            delete bidLevels[marketId][price];
        } else {
            delete askLevels[marketId][price];
        }
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

    function _getOraclePrice(bytes32 marketId) internal view returns (uint256 price) {
        address oracle = engine.oracleRouter();
        (price, uint256 updatedAt) = IOracleRouter(oracle).getPriceData(marketId);
        require(price > 0 && updatedAt > 0, "No price");
        uint256 maxAge = engine.maxPriceAge();
        if (maxAge > 0) {
            require(block.timestamp - updatedAt <= maxAge, "Stale price");
        }
    }
}
