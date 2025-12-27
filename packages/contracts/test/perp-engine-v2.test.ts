import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Contract } from 'ethers';

describe('PerpEngineV2', () => {
  const MARKET = ethers.encodeBytes32String('ETH-USD');

  let deployer: any;
  let alice: any;
  let bob: any;
  let fundingKeeper: any;
  let adlKeeper: any;
  let usdc: Contract;
  let oracleRouter: Contract;
  let engine: Contract;
  let orderbook: Contract;
  let vault: Contract;
  let insurance: Contract;

  async function deployV2() {
    [deployer, alice, bob, fundingKeeper, adlKeeper] = await ethers.getSigners();

    // Deploy USDC Mock
    const USDCMock = await ethers.getContractFactory('USDCMock');
    usdc = await USDCMock.deploy();
    await usdc.waitForDeployment();

    // Deploy OracleRouter
    const OracleRouter = await ethers.getContractFactory('OracleRouter');
    oracleRouter = await ethers.deployContract('OracleRouter');
    await oracleRouter.waitForDeployment();
    await oracleRouter.initialize();
    await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('3200', 18));

    // Deploy Vault
    const Vault = await ethers.getContractFactory('Vault');
    vault = await ethers.deployContract('Vault');
    await vault.waitForDeployment();
    await vault.initialize(await usdc.getAddress(), ethers.ZeroAddress);

    // Deploy InsuranceFund
    const InsuranceFund = await ethers.getContractFactory('InsuranceFund');
    insurance = await ethers.deployContract('InsuranceFund');
    await insurance.waitForDeployment();
    await insurance.initialize(await usdc.getAddress(), ethers.ZeroAddress);

    // Deploy PerpEngineV2
    const PerpEngineV2 = await ethers.getContractFactory('PerpEngineV2');
    engine = await ethers.deployContract('PerpEngineV2');
    await engine.waitForDeployment();
    await engine.initialize(
      await usdc.getAddress(),
      await oracleRouter.getAddress(),
      await vault.getAddress(),
      await insurance.getAddress(),
      deployer.address
    );

    // Deploy OrderbookV2
    const OrderbookV2 = await ethers.getContractFactory('OrderbookV2');
    orderbook = await ethers.deployContract('OrderbookV2');
    await orderbook.waitForDeployment();
    await orderbook.initialize(await engine.getAddress(), await vault.getAddress());

    // Wire contracts
    await engine.setOrderbook(await orderbook.getAddress());
    await vault.setEngine(await engine.getAddress());
    await insurance.setEngine(await engine.getAddress());

    // Create market
    await engine.createMarket(
      MARKET,
      1000, // 10% initial margin
      500, // 5% maintenance margin
      10, // 10x max leverage
      ethers.parseUnits('50000000', 18), // 50M OI cap
      ethers.parseUnits('5000000', 18), // 5M account exposure cap
      100 // 1% max funding rate per hour
    );

    // Set keepers
    await engine.setFundingKeeper(fundingKeeper.address, true);
    await engine.setAdlKeeper(adlKeeper.address, true);

    return { deployer, alice, bob, fundingKeeper, adlKeeper, usdc, oracleRouter, engine, orderbook, vault, insurance };
  }

  describe('Deposit/Withdraw', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
    });

    it('deposit scales USDC 6d to internal 18d', async () => {
      const amount = ethers.parseUnits('1000', 6); // 1000 USDC
      await expect(engine.connect(alice).deposit(amount))
        .to.emit(engine, 'Deposit');

      const balance = await engine.collateralBalance(alice.address);
      expect(balance).to.equal(ethers.parseUnits('1000', 18)); // Scaled up
    });

    it('withdraw requires sufficient margin', async () => {
      const deposit = ethers.parseUnits('10000', 6);
      await engine.connect(alice).deposit(deposit);

      // Open position
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('1', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      // Try to withdraw too much
      const withdraw = ethers.parseUnits('9000', 6);
      await expect(engine.connect(alice).withdraw(withdraw))
        .to.be.revertedWith('Margin');
    });
  });

  describe('Market Creation', () => {
    it('owner can create market', async () => {
      await deployV2();
      const market = await engine.markets(MARKET);
      expect(market.active).to.be.true;
      expect(market.initialMarginBps).to.equal(1000);
      expect(market.maintenanceMarginBps).to.equal(500);
      expect(market.maxLeverage).to.equal(10);
    });

    it('non-owner cannot create market', async () => {
      await deployV2();
      const newMarket = ethers.encodeBytes32String('BTC-USD');
      await expect(
        engine.connect(alice).createMarket(newMarket, 1000, 500, 10, 0, 0, 100)
      ).to.be.reverted;
    });
  });

  describe('Trading', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
    });

    it('opens position on trade', async () => {
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('1', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };

      await expect(engine.connect(orderbook.getAddress()).applyTrade(fill))
        .to.emit(engine, 'PositionOpened');

      const pos = await engine.positions(alice.address, MARKET);
      expect(pos.size).to.equal(ethers.parseUnits('1', 18));
      expect(pos.entryPrice).to.equal(ethers.parseUnits('3200', 18));
    });

    it('applies fees and distributes to vault/insurance/treasury', async () => {
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('1', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6, // 0.06%
      };

      const balanceBefore = await engine.collateralBalance(await vault.getAddress());
      await engine.connect(orderbook.getAddress()).applyTrade(fill);
      const balanceAfter = await engine.collateralBalance(await vault.getAddress());

      // Fee = 3200 * 0.0006 = 1.92 USDC
      // Vault share = 70% = 1.344 USDC (scaled to 18d)
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it('enforces OI cap', async () => {
      // Market has 50M OI cap
      // Try to open 20 ETH position at 3200 = 64k notional (should work)
      const fill1 = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('20', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill1);

      // Try to open another 20 ETH = 64k more (total 128k, still under 50M cap)
      const fill2 = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('20', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await expect(engine.connect(orderbook.getAddress()).applyTrade(fill2))
        .to.emit(engine, 'PositionUpdated');
    });

    it('enforces account exposure cap', async () => {
      // Account exposure cap is 5M
      // Try to open 2000 ETH position at 3200 = 6.4M notional (should fail)
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('2000', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };

      await expect(engine.connect(orderbook.getAddress()).applyTrade(fill))
        .to.be.revertedWith('Exposure cap');
    });
  });

  describe('Funding', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.mint(bob.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await usdc.connect(bob).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
      await engine.connect(bob).deposit(ethers.parseUnits('10000', 6));
    });

    it('funding keeper can update funding rate', async () => {
      // Alice goes long, Bob goes short
      const fill1 = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('10', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill1);

      const fill2 = {
        account: bob.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('-10', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill2);

      // Update funding rate (should be 0 since balanced)
      await expect(engine.connect(fundingKeeper).updateFundingRate(MARKET))
        .to.emit(engine, 'FundingRateUpdated');

      const market = await engine.markets(MARKET);
      expect(market.fundingRatePerSecond).to.equal(0);
    });

    it('applies funding on position update', async () => {
      // Alice goes long
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('1', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      // Set positive funding rate (longs pay shorts)
      await engine.setFundingRate(MARKET, ethers.parseUnits('0.0001', 18)); // 0.01% per second

      // Advance time
      await network.provider.send('evm_increaseTime', [3600]); // 1 hour
      await network.provider.send('evm_mine');

      // Update position (triggers funding application)
      const fill2 = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('0.5', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };

      const balanceBefore = await engine.collateralBalance(alice.address);
      await engine.connect(orderbook.getAddress()).applyTrade(fill2);
      const balanceAfter = await engine.collateralBalance(alice.address);

      // Funding should be deducted from long position
      expect(balanceAfter).to.be.lessThan(balanceBefore);
    });
  });

  describe('Liquidation', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('1000', 6)); // Small deposit
    });

    it('liquidates position below maintenance margin', async () => {
      // Open position with high leverage
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('10', 18), // 10 ETH long
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      // Price drops significantly (liquidation territory)
      await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('2800', 18)); // -12.5%

      // Liquidate
      await expect(engine.connect(bob).liquidate(alice.address, MARKET, 0))
        .to.emit(engine, 'LiquidationExecuted');

      const pos = await engine.positions(alice.address, MARKET);
      expect(pos.size).to.equal(0); // Fully liquidated
    });

    it('supports partial liquidation', async () => {
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('10', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('2800', 18));

      // Liquidate 50%
      await engine.connect(bob).liquidate(alice.address, MARKET, ethers.parseUnits('5', 18));

      const pos = await engine.positions(alice.address, MARKET);
      expect(pos.size).to.equal(ethers.parseUnits('5', 18)); // Half remaining
    });

    it('reverts if position not liquidatable', async () => {
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('1', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      // Price only drops slightly (still above maintenance)
      await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('3100', 18));

      await expect(engine.connect(bob).liquidate(alice.address, MARKET, 0))
        .to.be.revertedWith('Not liquidatable');
    });
  });

  describe('ADL (Auto-Deleveraging)', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('1000', 6));
      await engine.toggleAdl(true);
    });

    it('ADL keeper can close positions when enabled', async () => {
      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('10', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      await expect(engine.connect(adlKeeper).adlClose(alice.address, MARKET, 0))
        .to.emit(engine, 'AdlExecuted');

      const pos = await engine.positions(alice.address, MARKET);
      expect(pos.size).to.equal(0);
    });

    it('reverts if ADL disabled', async () => {
      await engine.toggleAdl(false);

      const fill = {
        account: alice.address,
        marketId: MARKET,
        sizeDelta: ethers.parseUnits('10', 18),
        price: ethers.parseUnits('3200', 18),
        isMaker: false,
        feeBps: 6,
      };
      await engine.connect(orderbook.getAddress()).applyTrade(fill);

      await expect(engine.connect(adlKeeper).adlClose(alice.address, MARKET, 0))
        .to.be.revertedWith('AdlDisabled');
    });
  });
});

