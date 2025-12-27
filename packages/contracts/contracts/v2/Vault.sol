// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPerpEngineV2Vault {
    function collateralBalance(address account) external view returns (uint256);
    function depositFor(address account, uint256 amount) external;
    function withdraw(uint256 amount) external;
}

contract Vault is ERC20Upgradeable, OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant SCALE = 1e12;

    IERC20Upgradeable public asset;
    address public engine;

    event VaultDeposit(address indexed account, uint256 assets, uint256 shares);
    event VaultWithdraw(address indexed account, uint256 assets, uint256 shares);
    event EngineAllocation(uint256 assets);
    event EngineDeallocation(uint256 assets);
    event EngineUpdated(address indexed engine);

    function initialize(address asset_, address engine_) external initializer {
        __ERC20_init("Obsidian LP Vault", "oLP");
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
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

    function totalAssets() public view returns (uint256) {
        uint256 onHand = asset.balanceOf(address(this));
        if (engine == address(0)) return onHand;
        uint256 engineBalance = IPerpEngineV2Vault(engine).collateralBalance(address(this));
        return onHand + (engineBalance / SCALE);
    }

    function deposit(uint256 assets) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(assets > 0, "Amount=0");
        uint256 supply = totalSupply();
        uint256 total = totalAssets();
        shares = supply == 0 ? assets : (assets * supply) / total;
        _mint(msg.sender, shares);
        asset.safeTransferFrom(msg.sender, address(this), assets);
        emit VaultDeposit(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external nonReentrant whenNotPaused returns (uint256 assets) {
        require(shares > 0, "Shares=0");
        uint256 supply = totalSupply();
        assets = (shares * totalAssets()) / supply;
        _burn(msg.sender, shares);
        _pullFromEngineIfNeeded(assets);
        asset.safeTransfer(msg.sender, assets);
        emit VaultWithdraw(msg.sender, assets, shares);
    }

    function allocateToEngine(uint256 assets) external onlyOwner {
        require(engine != address(0), "No engine");
        asset.safeIncreaseAllowance(engine, assets);
        IPerpEngineV2Vault(engine).depositFor(address(this), assets);
        emit EngineAllocation(assets);
    }

    function deallocateFromEngine(uint256 assets) external onlyOwner {
        require(engine != address(0), "No engine");
        IPerpEngineV2Vault(engine).withdraw(assets);
        emit EngineDeallocation(assets);
    }

    function _pullFromEngineIfNeeded(uint256 assets) internal {
        uint256 onHand = asset.balanceOf(address(this));
        if (assets <= onHand || engine == address(0)) return;
        uint256 shortfall = assets - onHand;
        IPerpEngineV2Vault(engine).withdraw(shortfall);
    }
}
