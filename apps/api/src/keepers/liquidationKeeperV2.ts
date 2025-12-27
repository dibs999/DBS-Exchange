import { createPublicClient, createWalletClient, http, privateKeyToAccount, stringToHex } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';
import { getPool } from '../db/index.js';

const PERP_ENGINE_V2_ABI = [
  {
    type: 'function',
    name: 'getAccountMarkets',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'size', type: 'int256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'fundingEntry', type: 'int256' },
    ],
  },
  {
    type: 'function',
    name: 'liquidate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'sizeAbs', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

/**
 * V2 Liquidation Keeper
 * 
 * Monitors all positions and liquidates them when they fall below
 * maintenance margin requirements. Supports partial liquidations.
 * 
 * Runs every LIQUIDATION_KEEPER_INTERVAL milliseconds (default: 15s)
 */
export async function startLiquidationKeeperV2() {
  if (!env.liquidationKeeperEnabled || !env.engineV2Address || !env.keeperPrivateKey || !env.baseRpcUrl) {
    console.log('V2 Liquidation Keeper: Disabled or missing configuration');
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

  console.log('V2 Liquidation Keeper: Started');

  async function checkAndLiquidate() {
    try {
      // Get all positions from database (indexed positions)
      const pool = getPool();
      const result = await pool.query(`
        SELECT DISTINCT address, market_id 
        FROM v2_positions 
        WHERE closed_at IS NULL
      `);

      if (result.rows.length === 0) {
        return;
      }

      for (const row of result.rows) {
        const accountAddress = row.address as string;
        const marketId = row.market_id as string;

        try {
          const marketIdHex = stringToHex(marketId, { size: 32 });

          // Get position from contract
          const position = await publicClient.readContract({
            address: env.engineV2Address as `0x${string}`,
            abi: PERP_ENGINE_V2_ABI,
            functionName: 'positions',
            args: [accountAddress as `0x${string}`, marketIdHex],
          });

          // Check if position exists and has size
          if (position[0] === 0n) {
            continue;
          }

          // Try to liquidate - contract will revert if not liquidatable
          // sizeAbs = 0 means full liquidation
          try {
            const hash = await walletClient.writeContract({
              address: env.engineV2Address as `0x${string}`,
              abi: PERP_ENGINE_V2_ABI,
              functionName: 'liquidate',
              args: [accountAddress as `0x${string}`, marketIdHex, 0n], // Full liquidation
            });

            console.log(`V2 Liquidation Keeper: Liquidated position ${accountAddress}/${marketId}, tx: ${hash}`);
            await publicClient.waitForTransactionReceipt({ hash });
          } catch (err: any) {
            // Expected: Contract reverts if position not liquidatable
            if (!err.message?.includes('Not liquidatable') && !err.message?.includes('No position')) {
              console.warn(`V2 Liquidation Keeper: Error liquidating ${accountAddress}/${marketId}:`, err.message);
            }
          }
        } catch (err) {
          console.warn(`V2 Liquidation Keeper: Error checking position ${accountAddress}/${marketId}:`, err);
        }
      }
    } catch (err) {
      console.error('V2 Liquidation Keeper: Error in check cycle:', err);
    }
  }

  // Initial check
  await checkAndLiquidate();

  // Set up interval
  const interval = setInterval(checkAndLiquidate, env.liquidationKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('V2 Liquidation Keeper: Stopped');
  });
}

