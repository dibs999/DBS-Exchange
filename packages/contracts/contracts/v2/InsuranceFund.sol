// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPerpEngineV2Insurance {
    function depositFor(address account, uint256 amount) external;
    function withdraw(uint256 amount) external;
}

contract InsuranceFund is OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public asset;
    address public engine;

    event EngineUpdated(address indexed engine);
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event EngineAllocation(uint256 amount);
    event EngineDeallocation(uint256 amount);

    function initialize(address asset_, address engine_) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        require(asset_ != address(0), "Bad asset");
        asset = IERC20Upgradeable(asset_);
        engine = engine_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setEngine(address engine_) external onlyOwner {
        engine = engine_;
        emit EngineUpdated(engine_);
    }

    function fund(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount=0");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount=0");
        asset.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function allocateToEngine(uint256 amount) external onlyOwner {
        require(engine != address(0), "No engine");
        asset.safeIncreaseAllowance(engine, amount);
        IPerpEngineV2Insurance(engine).depositFor(address(this), amount);
        emit EngineAllocation(amount);
    }

    function deallocateFromEngine(uint256 amount) external onlyOwner {
        require(engine != address(0), "No engine");
        IPerpEngineV2Insurance(engine).withdraw(amount);
        emit EngineDeallocation(amount);
    }
}
