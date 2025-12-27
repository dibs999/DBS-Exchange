import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { Contract } from 'ethers';

describe('OrderbookV2', () => {
  const MARKET = ethers.encodeBytes32String('ETH-USD');
  const TICK_SIZE = ethers.parseUnits('1', 18); // 1 USD tick
  const MIN_SIZE = ethers.parseUnits('0.1', 18);
  const MAX_SIZE = ethers.parseUnits('100', 18);

  let deployer: any;
  let alice: any;
  let bob: any;
  let keeper: any;
  let usdc: Contract;
  let oracleRouter: Contract;
  let engine: Contract;
  let orderbook: Contract;
  let vault: Contract;

  async function deployV2() {
    [deployer, alice, bob, keeper] = await ethers.getSigners();

    // Deploy USDC Mock (6 decimals)
    const USDCMock = await ethers.getContractFactory('USDCMock');
    usdc = await USDCMock.deploy();
    await usdc.waitForDeployment();

    // Deploy OracleRouter
    const OracleRouter = await ethers.getContractFactory('OracleRouter');
    oracleRouter = await ethers.deployContract('OracleRouter');
    await oracleRouter.waitForDeployment();
    await oracleRouter.initialize();

    // Deploy Vault
    const Vault = await ethers.getContractFactory('Vault');
    vault = await ethers.deployContract('Vault');
    await vault.waitForDeployment();
    await vault.initialize(await usdc.getAddress(), ethers.ZeroAddress);

    // Deploy InsuranceFund
    const InsuranceFund = await ethers.getContractFactory('InsuranceFund');
    const insurance = await ethers.deployContract('InsuranceFund');
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

    // Configure market
    await engine.createMarket(
      MARKET,
      1000, // 10% initial margin
      500, // 5% maintenance margin
      10, // 10x max leverage
      ethers.parseUnits('50000000', 18), // 50M OI cap
      ethers.parseUnits('5000000', 18), // 5M account exposure cap
      100 // 1% max funding rate per hour
    );

    // Set market config in orderbook
    await orderbook.setMarket(
      MARKET,
      TICK_SIZE,
      MIN_SIZE,
      MAX_SIZE,
      300, // 5 min auction interval
      100, // max 100 orders per auction
      true // vault enabled
    );

    // Set keeper
    await orderbook.setKeeper(keeper.address, true);

    // Set oracle price
    await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('3200', 18));

    return { deployer, alice, bob, keeper, usdc, oracleRouter, engine, orderbook, vault };
  }

  describe('Market Configuration', () => {
    it('owner can configure market', async () => {
      await deployV2();
      const cfg = await orderbook.markets(MARKET);
      expect(cfg.active).to.be.true;
      expect(cfg.tickSize).to.equal(TICK_SIZE);
      expect(cfg.minSize).to.equal(MIN_SIZE);
    });

    it('non-owner cannot configure market', async () => {
      await deployV2();
      await expect(
        orderbook.connect(alice).setMarket(MARKET, TICK_SIZE, MIN_SIZE, MAX_SIZE, 300, 100, true)
      ).to.be.reverted;
    });
  });

  describe('Order Placement', () => {
    beforeEach(async () => {
      await deployV2();
      // Fund alice
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
    });

    it('can place continuous limit order', async () => {
      const price = ethers.parseUnits('3200', 18);
      const size = ethers.parseUnits('1', 18);

      const tx = await orderbook
        .connect(alice)
        .placeOrder(MARKET, size, price, 0, 1, 0); // continuous, limit, no trigger

      await expect(tx).to.emit(orderbook, 'OrderPlaced');
      const order = await orderbook.orders(1);
      expect(order.status).to.equal(1); // Live
      expect(order.mode).to.equal(0); // Continuous
      expect(order.orderType).to.equal(1); // Limit
    });

    it('can place batch limit order', async () => {
      const price = ethers.parseUnits('3200', 18);
      const size = ethers.parseUnits('1', 18);

      const tx = await orderbook
        .connect(alice)
        .placeOrder(MARKET, size, price, 1, 1, 0); // batch, limit, no trigger

      await expect(tx).to.emit(orderbook, 'OrderPlaced');
      await expect(tx).to.emit(orderbook, 'OrderQueued');
      const order = await orderbook.orders(1);
      expect(order.status).to.equal(2); // QueuedForAuction
      expect(order.mode).to.equal(1); // Batch
    });

    it('can place stop order', async () => {
      const triggerPrice = ethers.parseUnits('3300', 18);
      const size = ethers.parseUnits('1', 18);

      const tx = await orderbook
        .connect(alice)
        .placeOrder(MARKET, size, 0, 0, 2, triggerPrice); // continuous, stop, trigger

      await expect(tx).to.emit(orderbook, 'OrderPlaced');
      const order = await orderbook.orders(1);
      expect(order.status).to.equal(3); // TriggerPending
      expect(order.orderType).to.equal(2); // Stop
    });

    it('reverts on invalid price (not tick-aligned)', async () => {
      const price = ethers.parseUnits('3200.5', 18); // Not aligned to tick
      const size = ethers.parseUnits('1', 18);

      await expect(
        orderbook.connect(alice).placeOrder(MARKET, size, price, 0, 1, 0)
      ).to.be.revertedWith('Tick');
    });

    it('reverts on size below minimum', async () => {
      const price = ethers.parseUnits('3200', 18);
      const size = ethers.parseUnits('0.05', 18); // Below min

      await expect(
        orderbook.connect(alice).placeOrder(MARKET, size, price, 0, 1, 0)
      ).to.be.revertedWith('min size');
    });
  });

  describe('Continuous Matching', () => {
    beforeEach(async () => {
      await deployV2();
      // Fund both users
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.mint(bob.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await usdc.connect(bob).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
      await engine.connect(bob).deposit(ethers.parseUnits('10000', 6));
    });

    it('matches maker and taker orders', async () => {
      // Alice places limit buy at 3200
      const makerPrice = ethers.parseUnits('3200', 18);
      const makerSize = ethers.parseUnits('1', 18);
      await orderbook.connect(alice).placeOrder(MARKET, makerSize, makerPrice, 0, 1, 0);

      // Bob places market sell (should match immediately)
      await orderbook.connect(bob).placeOrder(MARKET, -makerSize, 0, 0, 0, 0);

      // Check orders are filled
      const makerOrder = await orderbook.orders(1);
      const takerOrder = await orderbook.orders(2);
      expect(makerOrder.status).to.equal(4); // Filled
      expect(takerOrder.status).to.equal(4); // Filled

      // Check positions
      const alicePos = await engine.positions(alice.address, MARKET);
      const bobPos = await engine.positions(bob.address, MARKET);
      expect(alicePos.size).to.equal(makerSize);
      expect(bobPos.size).to.equal(-makerSize);
    });

    it('handles partial fills', async () => {
      // Alice places limit buy at 3200 for 2 ETH
      const makerPrice = ethers.parseUnits('3200', 18);
      const makerSize = ethers.parseUnits('2', 18);
      await orderbook.connect(alice).placeOrder(MARKET, makerSize, makerPrice, 0, 1, 0);

      // Bob places market sell for 1 ETH (partial fill)
      const takerSize = ethers.parseUnits('1', 18);
      await orderbook.connect(bob).placeOrder(MARKET, -takerSize, 0, 0, 0, 0);

      // Maker order should still be live with remaining size
      const makerOrder = await orderbook.orders(1);
      expect(makerOrder.status).to.equal(1); // Still Live
      expect(makerOrder.size).to.equal(ethers.parseUnits('1', 18)); // Remaining
    });
  });

  describe('Batch Auction', () => {
    beforeEach(async () => {
      await deployV2();
      // Fund users
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.mint(bob.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await usdc.connect(bob).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
      await engine.connect(bob).deposit(ethers.parseUnits('10000', 6));
    });

    it('executes auction and matches orders at clearing price', async () => {
      // Alice places batch buy at 3200
      const buyPrice = ethers.parseUnits('3200', 18);
      const buySize = ethers.parseUnits('1', 18);
      await orderbook.connect(alice).placeOrder(MARKET, buySize, buyPrice, 1, 1, 0); // batch

      // Bob places batch sell at 3200
      const sellPrice = ethers.parseUnits('3200', 18);
      const sellSize = ethers.parseUnits('1', 18);
      await orderbook.connect(bob).placeOrder(MARKET, -sellSize, sellPrice, 1, 1, 0); // batch

      // Execute auction
      await expect(orderbook.connect(keeper).executeAuction(MARKET))
        .to.emit(orderbook, 'AuctionExecuted');

      // Check orders are filled
      const buyOrder = await orderbook.orders(1);
      const sellOrder = await orderbook.orders(2);
      expect(buyOrder.status).to.equal(4); // Filled
      expect(sellOrder.status).to.equal(4); // Filled
    });

    it('respects auction interval', async () => {
      // Set auction interval to 5 minutes
      await orderbook.setMarket(MARKET, TICK_SIZE, MIN_SIZE, MAX_SIZE, 300, 100, true);

      // Place orders
      await orderbook.connect(alice).placeOrder(MARKET, ethers.parseUnits('1', 18), ethers.parseUnits('3200', 18), 1, 1, 0);

      // Try to execute immediately (should fail)
      await expect(orderbook.connect(keeper).executeAuction(MARKET)).to.be.revertedWith('Auction cooldown');

      // Advance time
      await network.provider.send('evm_increaseTime', [301]);
      await network.provider.send('evm_mine');

      // Now should succeed
      await expect(orderbook.connect(keeper).executeAuction(MARKET)).to.emit(orderbook, 'AuctionExecuted');
    });
  });

  describe('Stop Orders', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
    });

    it('keeper can trigger stop order when price reached', async () => {
      // Place stop buy at 3300
      const triggerPrice = ethers.parseUnits('3300', 18);
      const size = ethers.parseUnits('1', 18);
      await orderbook.connect(alice).placeOrder(MARKET, size, 0, 0, 2, triggerPrice);

      // Update oracle to trigger price
      await oracleRouter.setPriceManual(MARKET, ethers.parseUnits('3300', 18));

      // Keeper triggers stop order
      await expect(orderbook.connect(keeper).triggerStopOrder(1))
        .to.emit(orderbook, 'OrderMatched');

      const order = await orderbook.orders(1);
      expect(order.status).to.equal(1); // Live (or Filled if market order)
    });

    it('reverts if stop price not reached', async () => {
      const triggerPrice = ethers.parseUnits('3300', 18);
      const size = ethers.parseUnits('1', 18);
      await orderbook.connect(alice).placeOrder(MARKET, size, 0, 0, 2, triggerPrice);

      // Oracle still at 3200
      await expect(orderbook.connect(keeper).triggerStopOrder(1))
        .to.be.revertedWith('Stop not reached');
    });
  });

  describe('Order Cancellation', () => {
    beforeEach(async () => {
      await deployV2();
      await usdc.mint(alice.address, ethers.parseUnits('100000', 6));
      await usdc.connect(alice).approve(await engine.getAddress(), ethers.MaxUint256);
      await engine.connect(alice).deposit(ethers.parseUnits('10000', 6));
    });

    it('owner can cancel live order', async () => {
      await orderbook.connect(alice).placeOrder(MARKET, ethers.parseUnits('1', 18), ethers.parseUnits('3200', 18), 0, 1, 0);

      await expect(orderbook.connect(alice).cancelOrder(1))
        .to.emit(orderbook, 'OrderCancelled');

      const order = await orderbook.orders(1);
      expect(order.status).to.equal(5); // Cancelled
    });

    it('owner can cancel queued order', async () => {
      await orderbook.connect(alice).placeOrder(MARKET, ethers.parseUnits('1', 18), ethers.parseUnits('3200', 18), 1, 1, 0);

      await expect(orderbook.connect(alice).cancelOrder(1))
        .to.emit(orderbook, 'OrderCancelled');

      const order = await orderbook.orders(1);
      expect(order.status).to.equal(5); // Cancelled
    });

    it('non-owner cannot cancel order', async () => {
      await orderbook.connect(alice).placeOrder(MARKET, ethers.parseUnits('1', 18), ethers.parseUnits('3200', 18), 0, 1, 0);

      await expect(orderbook.connect(bob).cancelOrder(1))
        .to.be.revertedWith('Not owner');
    });
  });
});

