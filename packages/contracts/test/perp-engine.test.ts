import { expect } from 'chai';
import { ethers, network } from 'hardhat';

describe('PerpEngine (security + invariants)', () => {
  const MARKET = ethers.encodeBytes32String('ETH-USD');

  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Collateral = await ethers.getContractFactory('CollateralToken');
    const collateral = await Collateral.connect(deployer).deploy('Obsidian USD', 'oUSD');
    await collateral.waitForDeployment();

    const Oracle = await ethers.getContractFactory('Oracle');
    const oracle = await Oracle.connect(deployer).deploy();
    await oracle.waitForDeployment();

    const Engine = await ethers.getContractFactory('PerpEngine');
    const engine = await Engine.connect(deployer).deploy(await collateral.getAddress(), await oracle.getAddress());
    await engine.waitForDeployment();

    const Orderbook = await ethers.getContractFactory('Orderbook');
    const orderbook = await Orderbook.connect(deployer).deploy(await engine.getAddress());
    await orderbook.waitForDeployment();

    // Create market + seed price
    await engine.connect(deployer).createMarket(MARKET, 1000, 500, 10); // 10% init, 5% maint, max 10x
    await oracle.connect(deployer).setPrice(MARKET, ethers.parseUnits('3200', 18));

    return { deployer, alice, bob, collateral, oracle, engine, orderbook };
  }

  it('only owner can configure markets & oracle', async () => {
    const { alice, engine } = await deploy();
    await expect(engine.connect(alice).createMarket(MARKET, 1000, 500, 10)).to.be.reverted;
    await expect(engine.connect(alice).setOracle(ethers.ZeroAddress)).to.be.reverted;
    await expect(engine.connect(alice).setFundingRate(MARKET, 1)).to.be.reverted;
  });

  it('deposit/withdraw updates collateralBalance and transfers tokens', async () => {
    const { deployer, alice, collateral, engine } = await deploy();
    const amount = ethers.parseUnits('1000', 18);

    await collateral.connect(deployer).mint(alice.address, amount);
    await collateral.connect(alice).approve(await engine.getAddress(), amount);

    await expect(engine.connect(alice).deposit(amount))
      .to.emit(engine, 'Deposit')
      .withArgs(alice.address, amount);

    expect(await engine.collateralBalance(alice.address)).to.equal(amount);

    const withdraw = ethers.parseUnits('250', 18);
    await expect(engine.connect(alice).withdraw(withdraw))
      .to.emit(engine, 'Withdraw')
      .withArgs(alice.address, withdraw);

    expect(await engine.collateralBalance(alice.address)).to.equal(amount - withdraw);
  });

  it('openPosition locks margin and reduces free collateral', async () => {
    const { deployer, alice, collateral, engine } = await deploy();
    const deposit = ethers.parseUnits('5000', 18);
    await collateral.connect(deployer).mint(alice.address, deposit);
    await collateral.connect(alice).approve(await engine.getAddress(), deposit);
    await engine.connect(alice).deposit(deposit);

    const size = ethers.parseUnits('1', 18); // 1 ETH
    const leverage = 5n;

    await expect(engine.connect(alice).openPosition(MARKET, size, leverage)).to.emit(engine, 'PositionOpened');

    const pos = await engine.getPosition(alice.address, MARKET);
    expect(pos.size).to.equal(size);
    expect(pos.entryPrice).to.equal(ethers.parseUnits('3200', 18));

    // requiredMargin = notional/leverage = (1*3200)/5 = 640
    const expectedMargin = ethers.parseUnits('640', 18);
    expect(pos.margin).to.equal(expectedMargin);

    const free = await engine.collateralBalance(alice.address);
    expect(free).to.equal(deposit - expectedMargin);
  });

  it('closePosition releases margin back to free collateral', async () => {
    const { deployer, alice, collateral, engine } = await deploy();
    const deposit = ethers.parseUnits('5000', 18);
    await collateral.connect(deployer).mint(alice.address, deposit);
    await collateral.connect(alice).approve(await engine.getAddress(), deposit);
    await engine.connect(alice).deposit(deposit);

    const size = ethers.parseUnits('1', 18);
    const leverage = 5n;
    await engine.connect(alice).openPosition(MARKET, size, leverage);

    const before = await engine.collateralBalance(alice.address);
    await expect(engine.connect(alice).closePosition(MARKET)).to.emit(engine, 'PositionClosed');

    const after = await engine.collateralBalance(alice.address);
    expect(after).to.be.greaterThan(before); // margin released (+/- pnl)

    const pos = await engine.getPosition(alice.address, MARKET);
    expect(pos.size).to.equal(0n);
  });

  it('stale oracle price blocks trading', async () => {
    const { deployer, alice, collateral, engine, oracle } = await deploy();
    const deposit = ethers.parseUnits('5000', 18);
    await collateral.connect(deployer).mint(alice.address, deposit);
    await collateral.connect(alice).approve(await engine.getAddress(), deposit);
    await engine.connect(alice).deposit(deposit);

    // advance time beyond maxPriceAge (300s)
    await network.provider.send('evm_increaseTime', [301]);
    await network.provider.send('evm_mine');

    const size = ethers.parseUnits('1', 18);
    await expect(engine.connect(alice).openPosition(MARKET, size, 5)).to.be.revertedWith('Stale price');

    // refresh oracle then succeeds
    await oracle.connect(deployer).setPrice(MARKET, ethers.parseUnits('3200', 18));
    await expect(engine.connect(alice).openPosition(MARKET, size, 5)).to.emit(engine, 'PositionOpened');
  });

  it('orderbook requires operator approval and can execute triggered orders', async () => {
    const { deployer, alice, collateral, engine, orderbook } = await deploy();
    const deposit = ethers.parseUnits('5000', 18);
    await collateral.connect(deployer).mint(alice.address, deposit);
    await collateral.connect(alice).approve(await engine.getAddress(), deposit);
    await engine.connect(alice).deposit(deposit);

    // Without operator approval, createOrder reverts
    await expect(
      orderbook.connect(alice).createOrder(MARKET, ethers.parseUnits('1', 18), 5, ethers.parseUnits('3300', 18), false, false)
    ).to.be.revertedWith('Operator not approved');

    // Approve orderbook as operator
    await engine.connect(alice).setOperator(await orderbook.getAddress(), true);

    // Create a limit-buy order that triggers when price <= trigger
    const tx = await orderbook
      .connect(alice)
      .createOrder(MARKET, ethers.parseUnits('1', 18), 5, ethers.parseUnits('3300', 18), false, false);
    const receipt = await tx.wait();
    const created = receipt?.logs.find(() => true);
    expect(created).to.exist;

    // nextOrderId started at 1; created orderId should be 1
    await expect(orderbook.connect(deployer).executeOrder(1)).to.emit(orderbook, 'OrderExecuted');

    const pos = await engine.getPosition(alice.address, MARKET);
    expect(pos.size).to.equal(ethers.parseUnits('1', 18));
  });
});


