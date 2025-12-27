// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IVault {
    function depositFor(address account, uint256 amount) external;
    function withdraw(uint256 amount) external;
}

contract MockEngine {
    IERC20Upgradeable public collateral;
    mapping(address => uint256) public collateralBalance;

    function setCollateral(address _collateral) external {
        collateral = IERC20Upgradeable(_collateral);
    }

    function collateralBalance(address account) external view returns (uint256) {
        return collateralBalance[account];
    }

    function depositFor(address account, uint256 amount) external {
        collateral.transferFrom(msg.sender, address(this), amount);
        collateralBalance[account] += amount * 1e12; // Scale to 18d
    }

    function withdraw(uint256 amount) external {
        uint256 scaled = amount * 1e12;
        collateralBalance[msg.sender] -= scaled;
        collateral.transfer(msg.sender, amount);
    }
}

