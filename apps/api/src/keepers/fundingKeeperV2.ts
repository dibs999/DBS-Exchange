import { createPublicClient, createWalletClient, http, privateKeyToAccount, stringToHex } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';

const PERP_ENGINE_V2_ABI = [
  {
    type: 'function',
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'active', type: 'bool' },
      { name: 'initialMarginBps', type: 'uint256' },
      { name: 'maintenanceMarginBps', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'maxOpenInterest', type: 'uint256' },
      { name: 'maxAccountExposure', type: 'uint256' },
      { name: 'maxFundingRateBps', type: 'uint256' },
      { name: 'openInterest', type: 'uint256' },
      { name: 'longSize', type: 'uint256' },
      { name: 'shortSize', type: 'uint256' },
      { name: 'cumulativeFundingRate', type: 'int256' },
      { name: 'fundingRatePerSecond', type: 'int256' },
      { name: 'lastFundingTime', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'updateFundingRate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

/**
 * V2 Funding Rate Automation Keeper
 * 
 * Calls updateFundingRate on PerpEngineV2 which calculates and updates
 * funding rates based on Long/Short imbalance on-chain.
 * 
 * Runs every FUNDING_KEEPER_INTERVAL milliseconds (default: 1 hour)
 */
export async function startFundingKeeperV2() {
  if (!env.fundingKeeperEnabled || !env.engineV2Address || !env.keeperPrivateKey || !env.baseRpcUrl) {
    console.log('V2 Funding Keeper: Disabled or missing configuration');
    return;
  }

  const account = privateKeyToAccount(env.keeperPrivateKey as `0x${string}`);
  const chain = env.chainId === 8453 ? base : sepolia;
  const publicClient = createPublicClient({
    chain,
    transport: http(env.baseRpcUrl || env.rpcUrl),
  });
  const walletClient = createWalletClient({
    chain,
    transport: http(env.baseRpcUrl || env.rpcUrl),
    account,
  });

  console.log('V2 Funding Keeper: Started');

  async function updateFundingRates() {
    try {
      if (!env.marketId) return;

      const marketIdHex = stringToHex(env.marketId, { size: 32 });

      // Get market to check if active
      const market = await publicClient.readContract({
        address: env.engineV2Address as `0x${string}`,
        abi: PERP_ENGINE_V2_ABI,
        functionName: 'markets',
        args: [marketIdHex],
      });

      if (!market[0]) {
        console.log('V2 Funding Keeper: Market not active');
        return;
      }

      // Call updateFundingRate (calculates on-chain)
      try {
        const hash = await walletClient.writeContract({
          address: env.engineV2Address as `0x${string}`,
          abi: PERP_ENGINE_V2_ABI,
          functionName: 'updateFundingRate',
          args: [marketIdHex],
        });

        console.log(`V2 Funding Keeper: Updated funding rate for ${env.marketId}, tx: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err) {
        console.error('V2 Funding Keeper: Error updating funding rate:', err);
      }
    } catch (err) {
      console.error('V2 Funding Keeper: Error in update cycle:', err);
    }
  }

  // Initial update
  await updateFundingRates();

  // Set up interval
  const interval = setInterval(updateFundingRates, env.fundingKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('V2 Funding Keeper: Stopped');
  });
}

