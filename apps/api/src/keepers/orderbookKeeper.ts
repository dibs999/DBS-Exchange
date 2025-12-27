import { createPublicClient, createWalletClient, formatUnits, http, privateKeyToAccount } from 'viem';
import { sepolia } from 'viem/chains';
import { ORDERBOOK_ABI } from '../abi.js';
import { env } from '../config.js';

type Order = {
  owner: `0x${string}`;
  marketId: `0x${string}`;
  sizeDelta: bigint;
  leverage: bigint;
  triggerPrice: bigint;
  isStop: boolean;
  reduceOnly: boolean;
  active: boolean;
  createdAt: bigint;
};

/**
 * Orderbook Execution Keeper
 * 
 * Monitors active orders in the Orderbook contract and executes them
 * when their trigger conditions are met (limit/stop orders).
 * 
 * Runs every ORDERBOOK_KEEPER_INTERVAL milliseconds (default: 10s)
 */
export async function startOrderbookKeeper() {
  if (!env.orderbookKeeperEnabled || !env.orderbookAddress || !env.keeperPrivateKey || !env.rpcUrl) {
    console.log('Orderbook Keeper: Disabled or missing configuration');
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

  console.log('Orderbook Keeper: Started');

  async function checkAndExecuteOrders() {
    try {
      // Get nextOrderId to know how many orders exist
      const nextOrderId = await publicClient.readContract({
        address: env.orderbookAddress as `0x${string}`,
        abi: ORDERBOOK_ABI,
        functionName: 'nextOrderId',
      });

      if (nextOrderId === 0n) {
        return; // No orders yet
      }

      // Check all orders from 1 to nextOrderId - 1
      const ordersToCheck: Array<{ orderId: bigint; order: Order }> = [];
      
      for (let i = 1n; i < nextOrderId; i++) {
        try {
          const order = await publicClient.readContract({
            address: env.orderbookAddress as `0x${string}`,
            abi: ORDERBOOK_ABI,
            functionName: 'orders',
            args: [i],
          }) as Order;

          if (order.active) {
            ordersToCheck.push({ orderId: i, order });
          }
        } catch (err) {
          // Order might not exist or contract call failed, skip
          continue;
        }
      }

      if (ordersToCheck.length === 0) {
        return;
      }

      // Get current price for each market
      const marketPrices = new Map<string, bigint>();
      
      for (const { order } of ordersToCheck) {
        const marketIdHex = order.marketId;
        if (marketPrices.has(marketIdHex)) continue;

        try {
          // Get price from Oracle via Engine
          // We need to read from Oracle contract directly
          // For now, we'll try to execute and let the contract validate
          // The contract will revert if price conditions aren't met
        } catch (err) {
          console.warn(`Orderbook Keeper: Failed to get price for market ${marketIdHex}`, err);
        }
      }

      // Try to execute orders that might be ready
      // The contract will validate trigger conditions
      for (const { orderId, order } of ordersToCheck) {
        try {
          // Check if trigger condition is met
          // For limit orders: price <= triggerPrice (buy) or price >= triggerPrice (sell)
          // For stop orders: price >= triggerPrice (buy) or price <= triggerPrice (sell)
          // Market orders (triggerPrice = 0) are executed immediately by user
          
          if (order.triggerPrice === 0n) {
            continue; // Market orders are executed by users, not keeper
          }

          // Attempt execution - contract will revert if conditions not met
          const hash = await walletClient.writeContract({
            address: env.orderbookAddress as `0x${string}`,
            abi: ORDERBOOK_ABI,
            functionName: 'executeOrder',
            args: [orderId],
          });

          console.log(`Orderbook Keeper: Executed order ${orderId}, tx: ${hash}`);
          
          // Wait for confirmation
          await publicClient.waitForTransactionReceipt({ hash });
        } catch (err: any) {
          // Expected: Contract reverts if trigger not reached
          // Only log unexpected errors
          if (!err.message?.includes('not reached') && !err.message?.includes('Inactive')) {
            console.warn(`Orderbook Keeper: Error executing order ${orderId}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error('Orderbook Keeper: Error in check cycle:', err);
    }
  }

  // Initial check
  await checkAndExecuteOrders();

  // Set up interval
  const interval = setInterval(checkAndExecuteOrders, env.orderbookKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Orderbook Keeper: Stopped');
  });
}

