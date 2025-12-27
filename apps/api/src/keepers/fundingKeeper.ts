import { createPublicClient, createWalletClient, formatUnits, http, parseUnits, privateKeyToAccount, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { ENGINE_ABI } from '../abi.js';
import { env } from '../config.js';
import { getPool } from '../db/index.js';

const ONE = 1e18;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/**
 * Funding Rate Automation Keeper
 * 
 * Calculates funding rates based on Long/Short imbalance and updates
 * them in the PerpEngine contract.
 * 
 * Formula: rate = (longNotional - shortNotional) / totalNotional * maxFundingRate
 * 
 * Runs every FUNDING_KEEPER_INTERVAL milliseconds (default: 1 hour)
 */
export async function startFundingKeeper() {
  if (!env.fundingKeeperEnabled || !env.engineAddress || !env.keeperPrivateKey || !env.rpcUrl) {
    console.log('Funding Keeper: Disabled or missing configuration');
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

  console.log('Funding Keeper: Started');

  async function calculateAndUpdateFunding() {
    try {
      const pool = getPool();
      const marketIdHex = stringToHex(env.marketId, { size: 32 });

      // Get all open positions for this market
      const result = await pool.query(`
        SELECT address, size, entry_price
        FROM positions_history
        WHERE market_id = $1 AND closed_at IS NULL
      `, [env.marketId]);

      if (result.rows.length === 0) {
        console.log('Funding Keeper: No open positions, skipping funding update');
        return;
      }

      // Get current market price from Oracle
      // We'll use the index price from the market state
      // In production, this should come from the Oracle contract
      const market = await publicClient.readContract({
        address: env.engineAddress as `0x${string}`,
        abi: ENGINE_ABI,
        functionName: 'markets',
        args: [marketIdHex],
      });

      if (!market[0]) {
        console.warn('Funding Keeper: Market not active');
        return;
      }

      // Calculate Long/Short imbalance
      let longNotional = 0;
      let shortNotional = 0;

      for (const row of result.rows) {
        const size = parseFloat(row.size);
        const entryPrice = parseFloat(row.entry_price);
        const notional = Math.abs(size) * entryPrice;

        if (size > 0) {
          longNotional += notional;
        } else {
          shortNotional += notional;
        }
      }

      const totalNotional = longNotional + shortNotional;

      if (totalNotional === 0) {
        console.log('Funding Keeper: No notional, skipping funding update');
        return;
      }

      // Calculate funding rate based on imbalance
      // Positive rate when longs > shorts (longs pay shorts)
      // Negative rate when shorts > longs (shorts pay longs)
      const imbalance = (longNotional - shortNotional) / totalNotional;
      const annualRate = imbalance * env.maxFundingRate;
      const ratePerSecond = annualRate / SECONDS_PER_YEAR;

      // Convert to int256 (in 18 decimals)
      const ratePerSecondBigInt = parseUnits(ratePerSecond.toFixed(18), 18);

      // Update funding rate in contract
      try {
        const hash = await walletClient.writeContract({
          address: env.engineAddress as `0x${string}`,
          abi: ENGINE_ABI,
          functionName: 'setFundingRate',
          args: [marketIdHex, ratePerSecondBigInt],
        });

        console.log(
          `Funding Keeper: Updated funding rate for ${env.marketId}:`,
          `imbalance=${(imbalance * 100).toFixed(2)}%,`,
          `rate=${(annualRate * 100).toFixed(4)}%/year,`,
          `tx: ${hash}`
        );

        // Store in database
        await pool.query(
          `INSERT INTO funding_history (market_id, rate, cumulative_rate, block_number)
           VALUES ($1, $2, $3, $4)`,
          [
            env.marketId,
            ratePerSecond,
            Number(formatUnits(market[4] as bigint, 18)), // cumulativeFundingRate
            await publicClient.getBlockNumber().then(b => Number(b)),
          ]
        );

        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err) {
        console.error('Funding Keeper: Error updating funding rate:', err);
      }
    } catch (err) {
      console.error('Funding Keeper: Error in calculation cycle:', err);
    }
  }

  // Initial calculation
  await calculateAndUpdateFunding();

  // Set up interval
  const interval = setInterval(calculateAndUpdateFunding, env.fundingKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Funding Keeper: Stopped');
  });
}

