import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const MARKET_ID = ethers.encodeBytes32String(process.env.MARKET_ID || "ETH-USD");

async function main() {
  const [deployer] = await ethers.getSigners();

  const Collateral = await ethers.deployContract("CollateralToken", ["Obsidian USD", "oUSD"]);
  await Collateral.waitForDeployment();

  const Oracle = await ethers.deployContract("Oracle");
  await Oracle.waitForDeployment();

  const Engine = await ethers.deployContract("PerpEngine", [Collateral.target, Oracle.target]);
  await Engine.waitForDeployment();

  const Orderbook = await ethers.deployContract("Orderbook", [Engine.target]);
  await Orderbook.waitForDeployment();

  const Faucet = await ethers.deployContract("Faucet", [Collateral.target]);
  await Faucet.waitForDeployment();

  // Fund faucet with tokens
  await (await Collateral.mint(Faucet.target, ethers.parseUnits("1000000", 18))).wait();

  await (await Engine.createMarket(MARKET_ID, 1000, 500, 15)).wait();
  await (await Oracle.setPrice(MARKET_ID, ethers.parseUnits("3200", 18))).wait();
  await (await Collateral.mint(deployer.address, ethers.parseUnits("100000", 18))).wait();

  const deployment = {
    network: "sepolia",
    collateralToken: Collateral.target,
    oracle: Oracle.target,
    perpEngine: Engine.target,
    orderbook: Orderbook.target,
    faucet: Faucet.target,
    marketId: MARKET_ID,
    deployer: deployer.address,
  };

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "sepolia.json"), JSON.stringify(deployment, null, 2));

  console.log("Deployed:", deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
