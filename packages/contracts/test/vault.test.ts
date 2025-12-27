import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';

describe('Vault', () => {
  let deployer: any;
  let alice: any;
  let bob: any;
  let usdc: Contract;
  let vault: Contract;
  let engine: Contract;

  async function deploy() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Deploy USDC Mock
    const USDCMock = await ethers.getContractFactory('USDCMock');
    usdc = await USDCMock.deploy();
    await usdc.waitForDeployment();

    // Deploy mock engine (simplified)
    const MockEngine = await ethers.getContractFactory('MockEngine');
    engine = await MockEngine.deploy();
    await engine.waitForDeployment();

    // Deploy Vault
    const Vault = await ethers.getContractFactory('Vault');
    vault = await ethers.deployContract('Vault');
    await vault.waitForDeployment();
    await vault.initialize(await usdc.getAddress(), await engine.getAddress());

    return { deployer, alice, bob, usdc, vault, engine };
  }

  // Mock Engine for testing
  const MockEngine = `
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
        
        constructor() {
            // Empty
        }
        
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
  `;

  describe('Initialization', () => {
    it('initializes correctly', async () => {
      await deploy();
      const asset = await vault.asset();
      const vaultEngine = await vault.engine();
      expect(asset).to.equal(await usdc.getAddress());
      expect(vaultEngine).to.equal(await engine.getAddress());
    });
  });

  describe('Deposits', () => {
    beforeEach(async () => {
      await deploy();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it('mints shares on first deposit', async () => {
      const amount = ethers.parseUnits('1000', 6);
      await expect(vault.connect(alice).deposit(amount))
        .to.emit(vault, 'VaultDeposit');

      const shares = await vault.balanceOf(alice.address);
      expect(shares).to.equal(amount); // 1:1 on first deposit
    });

    it('mints proportional shares on subsequent deposits', async () => {
      // First deposit: 1000 USDC
      await vault.connect(alice).deposit(ethers.parseUnits('1000', 6));
      const shares1 = await vault.balanceOf(alice.address);

      // Second deposit: 1000 USDC (should get same shares if no growth)
      await vault.connect(bob).deposit(ethers.parseUnits('1000', 6));
      const shares2 = await vault.balanceOf(bob.address);

      expect(shares1).to.equal(shares2);
    });

    it('reverts on zero deposit', async () => {
      await expect(vault.connect(alice).deposit(0))
        .to.be.revertedWith('Amount=0');
    });
  });

  describe('Withdrawals', () => {
    beforeEach(async () => {
      await deploy();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      await vault.connect(alice).deposit(ethers.parseUnits('10000', 6));
    });

    it('burns shares and transfers assets', async () => {
      const shares = await vault.balanceOf(alice.address);
      const balanceBefore = await usdc.balanceOf(alice.address);

      await expect(vault.connect(alice).withdraw(shares))
        .to.emit(vault, 'VaultWithdraw');

      const balanceAfter = await usdc.balanceOf(alice.address);
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
      expect(await vault.balanceOf(alice.address)).to.equal(0);
    });

    it('reverts on zero shares', async () => {
      await expect(vault.connect(alice).withdraw(0))
        .to.be.revertedWith('Shares=0');
    });
  });

  describe('Total Assets', () => {
    beforeEach(async () => {
      await deploy();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
    });

    it('includes on-hand assets', async () => {
      await vault.connect(alice).deposit(ethers.parseUnits('1000', 6));
      const total = await vault.totalAssets();
      expect(total).to.equal(ethers.parseUnits('1000', 6));
    });

    it('includes engine allocation', async () => {
      await vault.connect(alice).deposit(ethers.parseUnits('1000', 6));
      await vault.allocateToEngine(ethers.parseUnits('500', 6));

      const total = await vault.totalAssets();
      // Should still be 1000 (500 on-hand + 500 in engine)
      expect(total).to.equal(ethers.parseUnits('1000', 6));
    });
  });

  describe('Engine Allocation', () => {
    beforeEach(async () => {
      await deploy();
      await usdc.mint(deployer.address, ethers.parseUnits('100000', 6));
      await usdc.connect(deployer).approve(await vault.getAddress(), ethers.MaxUint256);
      await usdc.connect(deployer).approve(await engine.getAddress(), ethers.MaxUint256);
      await vault.connect(deployer).deposit(ethers.parseUnits('10000', 6));
    });

    it('owner can allocate to engine', async () => {
      const amount = ethers.parseUnits('5000', 6);
      await expect(vault.allocateToEngine(amount))
        .to.emit(vault, 'EngineAllocation');

      const engineBalance = await engine.collateralBalance(await vault.getAddress());
      expect(engineBalance).to.be.greaterThan(0);
    });

    it('owner can deallocate from engine', async () => {
      const amount = ethers.parseUnits('5000', 6);
      await vault.allocateToEngine(amount);

      await expect(vault.deallocateFromEngine(amount))
        .to.emit(vault, 'EngineDeallocation');
    });

    it('withdraw pulls from engine if needed', async () => {
      // Allocate all to engine
      const total = await vault.totalAssets();
      await vault.allocateToEngine(total);

      // Withdraw should pull from engine
      const shares = await vault.balanceOf(deployer.address);
      await expect(vault.connect(deployer).withdraw(shares))
        .to.emit(vault, 'VaultWithdraw');
    });
  });

  describe('Pausable', () => {
    beforeEach(async () => {
      await deploy();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    });

    it('owner can pause', async () => {
      await vault.pause();
      await expect(vault.connect(alice).deposit(ethers.parseUnits('1000', 6)))
        .to.be.reverted;
    });

    it('owner can unpause', async () => {
      await vault.pause();
      await vault.unpause();
      await expect(vault.connect(alice).deposit(ethers.parseUnits('1000', 6)))
        .to.emit(vault, 'VaultDeposit');
    });
  });
});

