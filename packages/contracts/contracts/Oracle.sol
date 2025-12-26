// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Oracle is Ownable {
    uint256 public constant BPS = 10_000;

    struct Price {
        uint256 value;
        uint256 updatedAt;
    }

    mapping(bytes32 => Price) public prices;
    uint256 public maxDeviationBps = 5_000;

    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp);
    event MaxDeviationUpdated(uint256 maxDeviationBps);

    constructor() Ownable(msg.sender) {}

    function setPrice(bytes32 marketId, uint256 price) external onlyOwner {
        require(price > 0, "Bad price");
        Price memory prev = prices[marketId];
        if (prev.value > 0 && maxDeviationBps > 0) {
            uint256 diff = price > prev.value ? price - prev.value : prev.value - price;
            require((diff * BPS) <= (prev.value * maxDeviationBps), "Max deviation");
        }
        prices[marketId] = Price({ value: price, updatedAt: block.timestamp });
        emit PriceUpdated(marketId, price, block.timestamp);
    }

    function setMaxDeviationBps(uint256 deviationBps) external onlyOwner {
        require(deviationBps > 0 && deviationBps <= BPS, "Bad deviation");
        maxDeviationBps = deviationBps;
        emit MaxDeviationUpdated(deviationBps);
    }

    function getPrice(bytes32 marketId) external view returns (uint256) {
        return prices[marketId].value;
    }

    function getPriceData(bytes32 marketId) external view returns (uint256, uint256) {
        Price memory data = prices[marketId];
        return (data.value, data.updatedAt);
    }
}
