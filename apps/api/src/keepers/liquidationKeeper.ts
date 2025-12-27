import { createPublicClient, createWalletClient, formatUnits, http, privateKeyToAccount, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { ENGINE_ABI } from '../abi.js';
import { env } from '../config.js';
import { getPool } from '../db/index.js';

type Position = {
  size: bigint;
  entryPrice: bigint;
  margin: bigint;
  fundingEntry: bigint;
};

/**
 * Liquidations Keeper
 * 
 * Monitors all positions and liquidates them when they fall below
 * maintenance margin requirements.
 * 
 * The liquidator receives a fee (liquidationFeeBps) as incentive.
 * 
 * Runs every LIQUIDATION_KEEPER_INTERVAL milliseconds (default: 15s)
 */
export async function startLiquidationKeeper() {
  if (!env.liquidationKeeperEnabled || !env.engineAddress || !env.keeperPrivateKey || !env.rpcUrl) {
    console.log('Liquidation Keeper: Disabled or missing configuration');
    return;
  }

  const account = privateKeyToAccount(env.keeperPrivateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(env.rpcUrl),
  });
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: http(env.rpcUrl),
    account,
  });

  console.log('Liquidation Keeper: Started');

  async function checkAndLiquidate() {
    try {
      // Get all positions from database (indexed positions)
      const pool = getPool();
      const result = await pool.query(`
        SELECT DISTINCT address, market_id 
        FROM positions_history 
        WHERE closed_at IS NULL
      `);

      if (result.rows.length === 0) {
        return;
      }

      const marketIdHex = stringToHex(env.marketId, { size: 32 });

      for (const row of result.rows) {
        const accountAddress = row.address as string;
        const marketId = row.market_id as string;

        try {
          // Get position from contract
          const position = await publicClient.readContract({
            address: env.engineAddress as `0x${string}`,
            abi: ENGINE_ABI,
            functionName: 'getPosition',
            args: [accountAddress as `0x${string}`, stringToHex(marketId, { size: 32 })],
          }) as Position;

          // Check if position exists and has size
          if (position.size === 0n) {
            continue;
          }

          // Get market config to check liquidation
          const market = await publicClient.readContract({
            address: env.engineAddress as `0x${string}`,
            abi: ENGINE_ABI,
            functionName: 'markets',
            args: [stringToHex(marketId, { size: 32 })],
          });

          if (!market[0]) {
            continue; // Market not active
          }

          // Try to liquidate - contract will revert if not liquidatable
          // This is more gas-efficient than checking _isLiquidatable off-chain
          try {
            const hash = await walletClient.writeContract({
              address: env.engineAddress as `0x${string}`,
              abi: ENGINE_ABI,
              functionName: 'liquidate',
              args: [stringToHex(marketId, { size: 32 }), accountAddress as `0x${string}`],
            });

            console.log(`Liquidation Keeper: Liquidated position ${accountAddress}/${marketId}, tx: ${hash}`);
            
            // Wait for confirmation
            await publicClient.waitForTransactionReceipt({ hash });
          } catch (err: any) {
            // Expected: Contract reverts if position not liquidatable
            if (!err.message?.includes('Not liquidatable') && !err.message?.includes('No position')) {
              console.warn(`Liquidation Keeper: Error liquidating ${accountAddress}/${marketId}:`, err.message);
            }
          }
        } catch (err) {
          console.warn(`Liquidation Keeper: Error checking position ${accountAddress}/${marketId}:`, err);
        }
      }
    } catch (err) {
      console.error('Liquidation Keeper: Error in check cycle:', err);
    }
  }

  // Initial check
  await checkAndLiquidate();

  // Set up interval
  const interval = setInterval(checkAndLiquidate, env.liquidationKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Liquidation Keeper: Stopped');
  });
}

