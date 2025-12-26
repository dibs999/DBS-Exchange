// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOracleReader {
    function getPriceData(bytes32 marketId) external view returns (uint256, uint256);
}

interface IPerpEngine {
    struct Position {
        int256 size;
        uint256 entryPrice;
        uint256 margin;
        int256 fundingEntry;
    }

    function openPositionFor(address account, bytes32 marketId, int256 sizeDelta, uint256 leverage) external;
    function getPosition(address account, bytes32 marketId) external view returns (Position memory);
    function isOperator(address account, address operator) external view returns (bool);
    function oracle() external view returns (address);
}

contract Orderbook is Ownable, ReentrancyGuard {
    struct Order {
        address owner;
        bytes32 marketId;
        int256 sizeDelta;
        uint256 leverage;
        uint256 triggerPrice;
        bool isStop;
        bool reduceOnly;
        bool active;
        uint64 createdAt;
    }

    uint256 public constant MAX_PRICE_AGE = 300;
    uint256 public nextOrderId = 1;

    IPerpEngine public engine;

    mapping(uint256 => Order) public orders;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed owner,
        bytes32 indexed marketId,
        int256 sizeDelta,
        uint256 leverage,
        uint256 triggerPrice,
        bool isStop,
        bool reduceOnly
    );
    event OrderCancelled(uint256 indexed orderId, address indexed owner);
    event OrderExecuted(uint256 indexed orderId, address indexed owner, bytes32 indexed marketId, int256 sizeDelta, uint256 executionPrice);

    constructor(address engine_) Ownable(msg.sender) {
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngine(engine_);
    }

    function setEngine(address engine_) external onlyOwner {
        require(engine_ != address(0), "Bad engine");
        engine = IPerpEngine(engine_);
    }

    function createOrder(
        bytes32 marketId,
        int256 sizeDelta,
        uint256 leverage,
        uint256 triggerPrice,
        bool isStop,
        bool reduceOnly
    ) external returns (uint256) {
        require(engine.isOperator(msg.sender, address(this)), "Operator not approved");
        require(sizeDelta != 0, "Size=0");
        require(leverage > 0, "Bad leverage");
        if (isStop || triggerPrice > 0) {
            require(triggerPrice > 0, "Bad trigger");
        }
        if (reduceOnly) {
            IPerpEngine.Position memory pos = engine.getPosition(msg.sender, marketId);
            require(pos.size != 0, "No position");
            require((pos.size > 0 && sizeDelta < 0) || (pos.size < 0 && sizeDelta > 0), "Reduce only");
        }

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender,
            marketId: marketId,
            sizeDelta: sizeDelta,
            leverage: leverage,
            triggerPrice: triggerPrice,
            isStop: isStop,
            reduceOnly: reduceOnly,
            active: true,
            createdAt: uint64(block.timestamp)
        });

        emit OrderCreated(orderId, msg.sender, marketId, sizeDelta, leverage, triggerPrice, isStop, reduceOnly);
        return orderId;
    }

    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.active, "Inactive");
        require(order.owner == msg.sender, "Not owner");
        order.active = false;
        emit OrderCancelled(orderId, msg.sender);
    }

    function executeOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.active, "Inactive");
        uint256 price = _getPrice(order.marketId);
        _validateTrigger(order, price);

        if (order.reduceOnly) {
            IPerpEngine.Position memory pos = engine.getPosition(order.owner, order.marketId);
            require(pos.size != 0, "No position");
            require((pos.size > 0 && order.sizeDelta < 0) || (pos.size < 0 && order.sizeDelta > 0), "Reduce only");
        }

        order.active = false;
        engine.openPositionFor(order.owner, order.marketId, order.sizeDelta, order.leverage);
        emit OrderExecuted(orderId, order.owner, order.marketId, order.sizeDelta, price);
    }

    function _getPrice(bytes32 marketId) internal view returns (uint256) {
        IOracleReader currentOracle = IOracleReader(engine.oracle());
        (uint256 price, uint256 updatedAt) = currentOracle.getPriceData(marketId);
        require(price > 0, "No price");
        require(updatedAt > 0 && block.timestamp - updatedAt <= MAX_PRICE_AGE, "Stale price");
        return price;
    }

    function _validateTrigger(Order memory order, uint256 price) internal pure {
        if (order.triggerPrice == 0) return;
        if (order.isStop) {
            if (order.sizeDelta > 0) {
                require(price >= order.triggerPrice, "Stop not reached");
            } else {
                require(price <= order.triggerPrice, "Stop not reached");
            }
        } else {
            if (order.sizeDelta > 0) {
                require(price <= order.triggerPrice, "Limit not reached");
            } else {
                require(price >= order.triggerPrice, "Limit not reached");
            }
        }
    }
}
