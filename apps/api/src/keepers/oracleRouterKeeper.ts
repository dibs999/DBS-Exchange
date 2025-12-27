import { createPublicClient, createWalletClient, formatUnits, http, parseUnits, privateKeyToAccount, stringToHex } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';

const ORACLE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'sources',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'updatePrice',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Oracle Router Keeper
 * 
 * Aggregates prices from multiple sources and updates the OracleRouter
 * contract with the aggregated price.
 * 
 * Runs every ORACLE_ROUTER_KEEPER_INTERVAL milliseconds (default: 30s)
 */
export async function startOracleRouterKeeper() {
  if (!env.oracleRouterKeeperEnabled || !env.oracleRouterAddress || !env.keeperPrivateKey || !env.baseRpcUrl) {
    console.log('Oracle Router Keeper: Disabled or missing configuration');
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

  console.log('Oracle Router Keeper: Started');

  async function updatePrices() {
    try {
      if (!env.marketId) return;

      const marketIdHex = stringToHex(env.marketId, { size: 32 });

      // Get sources for this market
      const sources = await publicClient.readContract({
        address: env.oracleRouterAddress as `0x${string}`,
        abi: ORACLE_ROUTER_ABI,
        functionName: 'sources',
        args: [marketIdHex],
      });

      if (sources.length === 0) {
        console.log('Oracle Router Keeper: No sources configured');
        return;
      }

      // Call updatePrice (aggregates on-chain)
      try {
        const hash = await walletClient.writeContract({
          address: env.oracleRouterAddress as `0x${string}`,
          abi: ORACLE_ROUTER_ABI,
          functionName: 'updatePrice',
          args: [marketIdHex],
        });

        console.log(`Oracle Router Keeper: Updated price for ${env.marketId}, tx: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err: any) {
        if (!err.message?.includes('No price') && !err.message?.includes('Max deviation')) {
          console.error('Oracle Router Keeper: Error updating price:', err);
        }
      }
    } catch (err) {
      console.error('Oracle Router Keeper: Error in update cycle:', err);
    }
  }

  // Initial update
  await updatePrices();

  // Set up interval
  const interval = setInterval(updatePrices, env.oracleRouterKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Oracle Router Keeper: Stopped');
  });
}

