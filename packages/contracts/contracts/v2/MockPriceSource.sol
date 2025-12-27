// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract MockPriceSource {
    uint256 public price;
    uint256 public updatedAt;

    function setPrice(uint256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function getPriceData(bytes32) external view returns (uint256, uint256) {
        return (price, updatedAt);
    }
}

