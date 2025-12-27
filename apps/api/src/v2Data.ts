import { Order, OrderbookLevel, Position, Trade } from '@dbs/shared';
import { createPublicClient, formatUnits, http, stringToHex } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from './config.js';

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
] as const;

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

type AuctionState = { inProgress: boolean; nextAuctionAt: number | null };

type CacheEntry<T> = { value: T; ts: number };

const PRICE_TTL_MS = 10_000;
const MARKET_TTL_MS = 300_000;
const AUCTION_TTL_MS = 10_000;

const priceCache = new Map<string, CacheEntry<number>>();
const marketCache = new Map<string, CacheEntry<{ initialMarginBps: number; maintenanceMarginBps: number }>>();
const auctionCache = new Map<string, CacheEntry<AuctionState>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, { value, ts: Date.now() });
}

function getClient() {
  const chain = env.chainId === 8453 ? base : sepolia;
  return createPublicClient({
    chain,
    transport: http(env.baseRpcUrl || env.rpcUrl),
  });
}

async function getOraclePrice(marketId: string): Promise<number> {
  const cached = readCache(priceCache, marketId, PRICE_TTL_MS);
  if (cached !== null) return cached;
  if (!env.oracleRouterAddress) return 0;
  const client = getClient();
  try {
    const marketIdHex = stringToHex(marketId, { size: 32 });
    const [price] = await client.readContract({
      address: env.oracleRouterAddress as `0x${string}`,
      abi: ORACLE_ROUTER_ABI,
      functionName: 'getPriceData',
      args: [marketIdHex],
    });
    const parsed = Number(formatUnits(price as bigint, 18));
    writeCache(priceCache, marketId, parsed);
    return parsed;
  } catch {
    return 0;
  }
}

async function getMarketConfig(marketId: string): Promise<{ initialMarginBps: number; maintenanceMarginBps: number }> {
  const cached = readCache(marketCache, marketId, MARKET_TTL_MS);
  if (cached !== null) return cached;
  if (!env.engineV2Address) return { initialMarginBps: 0, maintenanceMarginBps: 0 };
  const client = getClient();
  try {
    const marketIdHex = stringToHex(marketId, { size: 32 });
    const result = await client.readContract({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      functionName: 'markets',
      args: [marketIdHex],
    });
    const config = {
      initialMarginBps: Number(result[1] ?? 0),
      maintenanceMarginBps: Number(result[2] ?? 0),
    };
    writeCache(marketCache, marketId, config);
    return config;
  } catch {
    return { initialMarginBps: 0, maintenanceMarginBps: 0 };
  }
}

async function getAuctionState(marketId: string): Promise<AuctionState | null> {
  const cached = readCache(auctionCache, marketId, AUCTION_TTL_MS);
  if (cached !== null) return cached;
  if (!env.orderbookV2Address) return null;
  const client = getClient();
  try {
    const marketIdHex = stringToHex(marketId, { size: 32 });
    const market = await client.readContract({
      address: env.orderbookV2Address as `0x${string}`,
      abi: ORDERBOOK_V2_ABI,
      functionName: 'markets',
      args: [marketIdHex],
    });
    const auctionInterval = Number(market[4] ?? 0);
    const lastAuctionTs = Number(market[5] ?? 0);
    if (auctionInterval === 0) {
      const state = { inProgress: false, nextAuctionAt: null };
      writeCache(auctionCache, marketId, state);
      return state;
    }
    const last = lastAuctionTs > 0 ? lastAuctionTs : Math.floor(Date.now() / 1000);
    const nextAuctionAt = (last + auctionInterval) * 1000;
    const state = { inProgress: false, nextAuctionAt };
    writeCache(auctionCache, marketId, state);
    return state;
  } catch {
    return null;
  }
}

export async function getV2Orderbook(pool: any, marketId: string) {
  const result = await pool.query(
    `SELECT order_id, side, size, filled, price
     FROM v2_orders
     WHERE market_id = $1 AND status IN ('live', 'queued_for_auction')
     ORDER BY price DESC, created_at ASC`,
    [marketId]
  );

  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();

  for (const row of result.rows) {
    const price = row.price ? Number(row.price) : 0;
    if (!price) continue;
    const remaining = Number(row.size) - Number(row.filled || 0);
    if (remaining <= 0) continue;
    if (row.side === 'buy') {
      bidMap.set(price, (bidMap.get(price) ?? 0) + remaining);
    } else {
      askMap.set(price, (askMap.get(price) ?? 0) + remaining);
    }
  }

  const buildLevels = (map: Map<number, number>, desc: boolean): OrderbookLevel[] => {
    const levels = Array.from(map.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => (desc ? b.price - a.price : a.price - b.price))
      .slice(0, 30);

    let total = 0;
    return levels.map((level) => {
      total += level.size;
      return { price: level.price, size: level.size, total };
    });
  };

  const bids = buildLevels(bidMap, true);
  const asks = buildLevels(askMap, false);
  const auctionState = await getAuctionState(marketId);

  return { bids, asks, auctionState };
}

export async function getV2Trades(pool: any, marketId: string): Promise<Trade[]> {
  const result = await pool.query(
    `SELECT order_id, side, size, price, created_at
     FROM v2_trades
     WHERE market_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [marketId]
  );

  return result.rows.map((row: any) => ({
    id: row.order_id?.toString() || `${marketId}-${row.created_at.toISOString()}`,
    time: row.created_at.toISOString(),
    price: Number(row.price),
    size: Number(row.size),
    side: row.side,
  }));
}

export async function getV2Orders(pool: any, address: string): Promise<Order[]> {
  const result = await pool.query(
    `SELECT order_id, market_id, side, type, size, filled, price, trigger_price, status, created_at
     FROM v2_orders
     WHERE address = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [address.toLowerCase()]
  );

  return result.rows.map((row: any) => {
    const status =
      row.status === 'filled' ? 'filled' : row.status === 'cancelled' ? 'cancelled' : 'open';
    return {
      id: row.order_id.toString(),
      marketId: row.market_id,
      address,
      side: row.side,
      type: row.type,
      size: Number(row.size),
      filled: Number(row.filled || 0),
      triggerPrice: row.trigger_price ? Number(row.trigger_price) : undefined,
      leverage: 0,
      reduceOnly: false,
      status,
      createdAt: row.created_at.toISOString(),
    };
  });
}

export async function getV2Positions(pool: any, address: string): Promise<Position[]> {
  const result = await pool.query(
    `SELECT market_id, size, entry_price, funding_entry, opened_at
     FROM v2_positions
     WHERE address = $1 AND closed_at IS NULL`,
    [address.toLowerCase()]
  );

  const positions: Position[] = [];
  for (const row of result.rows) {
    const marketId = row.market_id as string;
    const size = Number(row.size);
    const sizeAbs = Math.abs(size);
    const entryPrice = Number(row.entry_price);
    const markPrice = await getOraclePrice(marketId);
    const price = markPrice || entryPrice || 0;
    const pnl = (price - entryPrice) * size;
    const notional = sizeAbs * price;
    const { initialMarginBps, maintenanceMarginBps } = await getMarketConfig(marketId);
    const margin = initialMarginBps > 0 ? (notional * initialMarginBps) / 10000 : 0;
    const leverage = margin > 0 ? Number((notional / margin).toFixed(2)) : 0;
    const maintenanceRatio = maintenanceMarginBps > 0 ? maintenanceMarginBps / 10000 : 0.05;
    const liquidationPrice =
      size >= 0
        ? entryPrice * (1 - maintenanceRatio)
        : entryPrice * (1 + maintenanceRatio);

    positions.push({
      id: `${marketId}-${row.opened_at}`,
      marketId,
      side: size >= 0 ? 'long' : 'short',
      size: sizeAbs,
      entryPrice,
      markPrice: price,
      pnl: Number(pnl.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      leverage,
      liquidationPrice: Number(liquidationPrice.toFixed(2)),
    });
  }

  return positions;
}

export function clearV2Caches() {
  priceCache.clear();
  marketCache.clear();
  auctionCache.clear();
}
