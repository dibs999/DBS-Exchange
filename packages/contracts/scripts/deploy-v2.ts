import { ethers, upgrades } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const MARKET_ID = ethers.encodeBytes32String(process.env.MARKET_ID || "ETH-USD");
const COLLATERAL_NAME = "USD Coin";
const COLLATERAL_SYMBOL = "USDC";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Collateral (use real USDC in prod; USDCMock only for test/dev)
  const useMock = process.env.USE_USDC_MOCK === "true";
  let collateralAddr = process.env.COLLATERAL_ADDRESS;
  if (useMock || !collateralAddr) {
    const USDCMock = await ethers.getContractFactory("USDCMock");
    const mock = await USDCMock.deploy();
    await mock.waitForDeployment();
    collateralAddr = await mock.getAddress();
    console.log("USDCMock:", collateralAddr);
  }

  // Oracle Router (UUPS)
  const OracleRouter = await ethers.getContractFactory("OracleRouter");
  const oracleRouter = await upgrades.deployProxy(OracleRouter, [], { kind: "uups" });
  await oracleRouter.waitForDeployment();
  console.log("OracleRouter (proxy):", await oracleRouter.getAddress());

  // Engine (UUPS)
  const PerpEngineV2 = await ethers.getContractFactory("PerpEngineV2");
  const engine = await upgrades.deployProxy(
    PerpEngineV2,
    [collateralAddr, await oracleRouter.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress],
    { kind: "uups" }
  );
  await engine.waitForDeployment();
  console.log("PerpEngineV2 (proxy):", await engine.getAddress());

  // Vault (UUPS)
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await upgrades.deployProxy(Vault, [collateralAddr, await engine.getAddress()], { kind: "uups" });
  await vault.waitForDeployment();
  console.log("Vault (proxy):", await vault.getAddress());

  // Insurance Fund (UUPS)
  const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
  const insurance = await upgrades.deployProxy(InsuranceFund, [collateralAddr, await engine.getAddress()], { kind: "uups" });
  await insurance.waitForDeployment();
  console.log("InsuranceFund (proxy):", await insurance.getAddress());

  // Orderbook (UUPS)
  const OrderbookV2 = await ethers.getContractFactory("OrderbookV2");
  const orderbook = await upgrades.deployProxy(OrderbookV2, [await engine.getAddress(), await vault.getAddress()], { kind: "uups" });
  await orderbook.waitForDeployment();
  console.log("OrderbookV2 (proxy):", await orderbook.getAddress());

  // Wire recipients (vault/insurance/treasury)
  await (await engine.setFeeRecipients(await vault.getAddress(), await insurance.getAddress(), deployer.address)).wait();
  await (await engine.setOrderbook(await orderbook.getAddress())).wait();

  // Create market defaults
  const maxOi = ethers.parseUnits("50000000", 18); // 50M notional (1e18 scale)
  const maxAccount = ethers.parseUnits("5000000", 18); // 5M per account

  await (
    await engine.createMarket(
      MARKET_ID,
      1000, // initial margin 10%
      500,  // maintenance 5%
      10,   // max leverage
      maxOi,
      maxAccount
    )
  ).wait();

  // Configure market on orderbook
  await (
    await orderbook.setMarket(
      MARKET_ID,
      1e17,     // tickSize ($0.1 if price uses 1e18)
      1e17,     // minSize (0.1 units in 1e18)
      0,        // maxSize (no cap)
      60,       // auction interval (seconds)
      100,      // max auction orders
      true      // vault residuals enabled
    )
  ).wait();

  // Output deployment artifact
  const deployment = {
    network: "base",
    collateral: collateralAddr,
    oracleRouter: await oracleRouter.getAddress(),
    engine: await engine.getAddress(),
    vault: await vault.getAddress(),
    insurance: await insurance.getAddress(),
    orderbook: await orderbook.getAddress(),
    marketId: MARKET_ID,
    deployer: deployer.address,
  };

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "base-v2.json");
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  console.log("Deployment saved:", file);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
