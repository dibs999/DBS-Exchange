import { createPublicClient, createWalletClient, formatUnits, http, privateKeyToAccount } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';

const ORDERBOOK_V2_ABI = [
  {
    type: 'function',
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'active', type: 'bool' },
      { name: 'tickSize', type: 'uint256' },
      { name: 'minSize', type: 'uint256' },
      { name: 'maxSize', type: 'uint256' },
      { name: 'auctionInterval', type: 'uint256' },
      { name: 'lastAuctionTs', type: 'uint256' },
      { name: 'maxAuctionOrders', type: 'uint256' },
      { name: 'vaultEnabled', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'executeAuction',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

/**
 * Auction Executor Keeper
 * 
 * Monitors markets and executes batch auctions when the auction interval
 * has elapsed and there are orders in the auction queue.
 * 
 * Runs every AUCTION_KEEPER_INTERVAL milliseconds (default: 1 minute)
 */
export async function startAuctionKeeper() {
  if (!env.auctionKeeperEnabled || !env.orderbookV2Address || !env.keeperPrivateKey || !env.baseRpcUrl) {
    console.log('Auction Keeper: Disabled or missing configuration');
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

  console.log('Auction Keeper: Started');

  async function checkAndExecuteAuctions() {
    try {
      if (!env.marketId) return;

      const marketIdHex = `0x${Buffer.from(env.marketId.padEnd(32, '\0')).toString('hex')}` as `0x${string}`;

      // Get market config
      const market = await publicClient.readContract({
        address: env.orderbookV2Address as `0x${string}`,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'markets',
        args: [marketIdHex],
      });

      if (!market[0]) {
        return; // Market not active
      }

      const auctionInterval = market[4];
      const lastAuctionTs = market[5];

      if (auctionInterval === 0n) {
        return; // Auctions disabled for this market
      }

      const now = BigInt(Math.floor(Date.now() / 1000));
      const timeSinceLastAuction = now - lastAuctionTs;

      if (timeSinceLastAuction < auctionInterval) {
        return; // Not time yet
      }

      // Execute auction
      try {
        const hash = await walletClient.writeContract({
          address: env.orderbookV2Address as `0x${string}`,
          abi: ORDERBOOK_V2_ABI,
          functionName: 'executeAuction',
          args: [marketIdHex],
        });

        console.log(`Auction Keeper: Executed auction for ${env.marketId}, tx: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (err: any) {
        if (!err.message?.includes('Auction cooldown') && !err.message?.includes('No orders')) {
          console.warn(`Auction Keeper: Error executing auction for ${env.marketId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Auction Keeper: Error in check cycle:', err);
    }
  }

  // Initial check
  await checkAndExecuteAuctions();

  // Set up interval
  const interval = setInterval(checkAndExecuteAuctions, env.auctionKeeperInterval);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Auction Keeper: Stopped');
  });
}

