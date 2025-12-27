import { createPublicClient, createWalletClient, formatUnits, http, privateKeyToAccount, stringToHex } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';

const ORDERBOOK_V2_ABI = [
  {
    type: 'function',
    name: 'nextOrderId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'size', type: 'int256' },
      { name: 'price', type: 'uint256' },
      { name: 'triggerPrice', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
      { name: 'orderType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'next', type: 'uint256' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'lastUpdateAt', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'triggerStopOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
] as const;

const ORACLE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getPriceData',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'price', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
    ],
  },
] as const;

type Order = {
  owner: `0x${string}`;
  marketId: `0x${string}`;
  size: bigint;
  price: bigint;
  triggerPrice: bigint;
  mode: bigint;
  orderType: bigint;
  status: bigint;
  next: bigint;
  createdAt: bigint;
  lastUpdateAt: bigint;
};

/**
 * Stop Trigger Keeper
 * 
 * Monitors stop orders and triggers them when their trigger price
 * conditions are met.
 * 
 * Runs every STOP_TRIGGER_KEEPER_INTERVAL milliseconds (default: 10s)
 */
export async function startStopTriggerKeeper() {
  if (!env.stopTriggerKeeperEnabled || !env.orderbookV2Address || !env.keeperPrivateKey || !env.baseRpcUrl) {
    console.log('Stop Trigger Keeper: Disabled or missing configuration');
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

  console.log('Stop Trigger Keeper: Started');

  async function checkAndTriggerStops() {
    try {
      // Get nextOrderId to know how many orders exist
      const nextOrderId = await publicClient.readContract({
        address: env.orderbookV2Address as `0x${string}`,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'nextOrderId',
      });

      if (nextOrderId === 0n) {
        return; // No orders yet
      }

      // Get oracle router address from orderbook (via engine)
      // For now, assume it's configured
      if (!env.oracleRouterAddress) {
        return;
      }

      const marketIdHex = stringToHex(env.marketId, { size: 32 });

      // Check all orders from 1 to nextOrderId - 1
      for (let i = 1n; i < nextOrderId; i++) {
        try {
          const order = await publicClient.readContract({
            address: env.orderbookV2Address as `0x${string}`,
            abi: ORDERBOOK_V2_ABI,
            functionName: 'orders',
            args: [i],
          }) as Order;

          // Only check stop orders that are pending trigger
          if (order.status !== 3n) continue; // Not TriggerPending

          // Get current price
          const [price] = await publicClient.readContract({
            address: env.oracleRouterAddress as `0x${string}`,
            abi: ORACLE_ROUTER_ABI,
            functionName: 'getPriceData',
            args: [order.marketId],
          });

          // Check if trigger condition is met
          // For buy stops: trigger when price >= triggerPrice
          // For sell stops: trigger when price <= triggerPrice
          let shouldTrigger = false;
          if (order.size > 0n) {
            // Buy stop
            shouldTrigger = price >= order.triggerPrice;
          } else {
            // Sell stop
            shouldTrigger = price <= order.triggerPrice;
          }

          if (shouldTrigger) {
            try {
              const hash = await walletClient.writeContract({
                address: env.orderbookV2Address as `0x${string}`,
                abi: ORDERBOOK_V2_ABI,
                functionName: 'triggerStopOrder',
                args: [i],
              });

              console.log(`Stop Trigger Keeper: Triggered order ${i}, tx: ${hash}`);
              await publicClient.waitForTransactionReceipt({ hash });
            } catch (err: any) {
              if (!err.message?.includes('Stop not reached')) {
                console.warn(`Stop Trigger Keeper: Error triggering order ${i}:`, err.message);
              }
            }
          }
        } catch (err) {
          // Order might not exist or contract call failed, skip
          continue;
        }
      }
    } catch (err) {
      console.error('Stop Trigger Keeper: Error in check cycle:', err);
    }
  }

  // Initial check
  await checkAndTriggerStops();

  // Set up interval
  const interval = setInterval(checkAndTriggerStops, env.stopTriggerKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Stop Trigger Keeper: Stopped');
  });
}

