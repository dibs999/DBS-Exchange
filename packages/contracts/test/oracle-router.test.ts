import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Contract } from 'ethers';

describe('OracleRouter', () => {
  const MARKET = ethers.encodeBytes32String('ETH-USD');

  let deployer: any;
  let oracleRouter: Contract;
  let mockSource1: Contract;
  let mockSource2: Contract;
  let mockSource3: Contract;

  // Mock Price Source Contract
  const MockPriceSource = `
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
  `;

  async function deploy() {
    [deployer] = await ethers.getSigners();

    // Deploy OracleRouter
    const OracleRouter = await ethers.getContractFactory('OracleRouter');
    oracleRouter = await ethers.deployContract('OracleRouter');
    await oracleRouter.waitForDeployment();
    await oracleRouter.initialize();

    // Deploy mock price sources
    const MockFactory = await ethers.getContractFactory('MockPriceSource');
    mockSource1 = await MockFactory.deploy();
    await mockSource1.waitForDeployment();
    mockSource2 = await MockFactory.deploy();
    await mockSource2.waitForDeployment();
    mockSource3 = await MockFactory.deploy();
    await mockSource3.waitForDeployment();

    return { deployer, oracleRouter, mockSource1, mockSource2, mockSource3 };
  }

  describe('Initialization', () => {
    it('initializes correctly', async () => {
      await deploy();
      const owner = await oracleRouter.owner();
      expect(owner).to.equal(deployer.address);
    });
  });

  describe('Market Configuration', () => {
    it('owner can set market config', async () => {
      await deploy();
      await oracleRouter.setMarketConfig(MARKET, 60, 500, 300); // 60s max age, 5% deviation, 300s TWAP

      const cfg = await oracleRouter.marketConfigs(MARKET);
      expect(cfg.maxPriceAge).to.equal(60);
      expect(cfg.maxDeviationBps).to.equal(500);
      expect(cfg.twapWindow).to.equal(300);
    });

    it('non-owner cannot set market config', async () => {
      await deploy();
      const [, alice] = await ethers.getSigners();
      await expect(
        oracleRouter.connect(alice).setMarketConfig(MARKET, 60, 500, 300)
      ).to.be.reverted;
    });
  });

  describe('Price Sources', () => {
    it('owner can set price sources', async () => {
      await deploy();
      await oracleRouter.setSources(MARKET, [
        await mockSource1.getAddress(),
        await mockSource2.getAddress(),
      ]);

      const sources = await oracleRouter.sources(MARKET);
      expect(sources.length).to.equal(2);
    });

    it('requires at least one source', async () => {
      await deploy();
      await expect(oracleRouter.setSources(MARKET, [])).to.be.revertedWith('No sources');
    });
  });

  describe('Price Aggregation', () => {
    beforeEach(async () => {
      await deploy();
      await oracleRouter.setMarketConfig(MARKET, 60, 5000, 0); // 60s max age, 50% deviation, no TWAP
      await oracleRouter.setSources(MARKET, [
        await mockSource1.getAddress(),
        await mockSource2.getAddress(),
        await mockSource3.getAddress(),
      ]);
    });

    it('aggregates prices from multiple sources', async () => {
      // Set prices: 3200, 3201, 3199
      await mockSource1.setPrice(ethers.parseUnits('3200', 18));
      await mockSource2.setPrice(ethers.parseUnits('3201', 18));
      await mockSource3.setPrice(ethers.parseUnits('3199', 18));

      const [price, validCount] = await oracleRouter.previewPrice(MARKET);
      expect(validCount).to.equal(3);
      // Average: (3200 + 3201 + 3199) / 3 = 3200
      expect(price).to.equal(ethers.parseUnits('3200', 18));
    });

    it('filters stale prices', async () => {
      await mockSource1.setPrice(ethers.parseUnits('3200', 18));
      await mockSource2.setPrice(ethers.parseUnits('3201', 18));

      // Advance time beyond maxPriceAge
      await network.provider.send('evm_increaseTime', [61]);
      await network.provider.send('evm_mine');

      // Set fresh price for source 3
      await mockSource3.setPrice(ethers.parseUnits('3199', 18));

      const [price, validCount] = await oracleRouter.previewPrice(MARKET);
      // Only source 3 should be valid
      expect(validCount).to.equal(1);
      expect(price).to.equal(ethers.parseUnits('3199', 18));
    });

    it('filters zero prices', async () => {
      await mockSource1.setPrice(ethers.parseUnits('3200', 18));
      await mockSource2.setPrice(0); // Invalid
      await mockSource3.setPrice(ethers.parseUnits('3199', 18));

      const [price, validCount] = await oracleRouter.previewPrice(MARKET);
      expect(validCount).to.equal(2);
      // Average: (3200 + 3199) / 2 = 3199.5
      expect(price).to.be.closeTo(ethers.parseUnits('3199.5', 18), ethers.parseUnits('0.1', 18));
    });
  });

  describe('Price Updates', () => {
    beforeEach(async () => {
      await deploy();
      await oracleRouter.setMarketConfig(MARKET, 60, 500, 0); // 5% max deviation
      await oracleRouter.setSources(MARKET, [await mockSource1.getAddress()]);
      await mockSource1.setPrice(ethers.parseUnits('3200', 18));
      await oracleRouter.updatePrice(MARKET);
    });

    it('updates price from aggregated sources', async () => {
      await mockSource1.setPrice(ethers.parseUnits('3201', 18));
      await expect(oracleRouter.updatePrice(MARKET))
        .to.emit(oracleRouter, 'PriceUpdated');

      const [price] = await oracleRouter.getPriceData(MARKET);
      expect(price).to.equal(ethers.parseUnits('3201', 18));
    });

    it('enforces max deviation', async () => {
      // Current price is 3200, max deviation is 5% = 160
      // Try to update to 3400 (6.25% deviation)
      await mockSource1.setPrice(ethers.parseUnits('3400', 18));
      await expect(oracleRouter.updatePrice(MARKET))
        .to.be.revertedWith('Max deviation');

      // Update to 3350 (4.69% deviation) should work
      await mockSource1.setPrice(ethers.parseUnits('3350', 18));
      await expect(oracleRouter.updatePrice(MARKET))
        .to.emit(oracleRouter, 'PriceUpdated');
    });

    it('allows manual price setting', async () => {
      await expect(oracleRouter.setPriceManual(MARKET, ethers.parseUnits('3250', 18)))
        .to.emit(oracleRouter, 'PriceSetManually');

      const [price] = await oracleRouter.getPriceData(MARKET);
      expect(price).to.equal(ethers.parseUnits('3250', 18));
    });
  });

  describe('TWAP (Time-Weighted Average Price)', () => {
    beforeEach(async () => {
      await deploy();
      await oracleRouter.setMarketConfig(MARKET, 60, 5000, 300); // 300s TWAP window
      await oracleRouter.setSources(MARKET, [await mockSource1.getAddress()]);
      await mockSource1.setPrice(ethers.parseUnits('3200', 18));
      await oracleRouter.updatePrice(MARKET);
    });

    it('applies TWAP when within window', async () => {
      // Advance 100 seconds
      await network.provider.send('evm_increaseTime', [100]);
      await network.provider.send('evm_mine');

      // New price is 3300
      await mockSource1.setPrice(ethers.parseUnits('3300', 18));
      await oracleRouter.updatePrice(MARKET);

      const [price] = await oracleRouter.getPriceData(MARKET);
      // TWAP: (3200 * 200 + 3300 * 100) / 300 = 3233.33...
      expect(price).to.be.closeTo(ethers.parseUnits('3233.33', 18), ethers.parseUnits('1', 18));
    });

    it('uses new price when TWAP window expired', async () => {
      // Advance beyond TWAP window
      await network.provider.send('evm_increaseTime', [301]);
      await network.provider.send('evm_mine');

      await mockSource1.setPrice(ethers.parseUnits('3300', 18));
      await oracleRouter.updatePrice(MARKET);

      const [price] = await oracleRouter.getPriceData(MARKET);
      // Should use new price directly
      expect(price).to.equal(ethers.parseUnits('3300', 18));
    });
  });
});

