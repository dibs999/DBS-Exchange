import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createPublicClient, createWalletClient, formatUnits, hexToString, http, isAddress, parseUnits, privateKeyToAccount, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { ENGINE_ABI, ORDERBOOK_ABI, ORACLE_ABI } from './abi';
import { env } from './config';
import { appendTrade, bumpMarket, getOrders, seedMarkets, state, updateOrderStatus, updateOrderbook, updatePrices, upsertOrder } from './store';
import { Market, Order, Orderbook, Position, PriceFeed, Trade, WsMessage } from '@dbs/shared';
import { initDb, getPool, closeDb } from './db/index.js';
import { startIndexer } from './indexer.js';
import { startIndexerV2 } from './indexer-v2.js';
import { startOrderbookKeeper } from './keepers/orderbookKeeper.js';
import { startLiquidationKeeper } from './keepers/liquidationKeeper.js';
import { startFundingKeeper } from './keepers/fundingKeeper.js';
import { startAuctionKeeper } from './keepers/auctionKeeper.js';
import { startStopTriggerKeeper } from './keepers/stopTriggerKeeper.js';
import { startFundingKeeperV2 } from './keepers/fundingKeeperV2.js';
import { startLiquidationKeeperV2 } from './keepers/liquidationKeeperV2.js';
import { startOracleRouterKeeper } from './keepers/oracleRouterKeeper.js';
import {
  createValidationMiddleware,
  validateMarketIdParam,
  validateAddressParam,
  validateAddressQuery,
  validatePaginationQuery,
} from './middleware/validation.js';
import { errorHandler } from './middleware/errorHandler.js';

type PositionState = {
  marketId: string;
  size: bigint;
  entryPrice: bigint;
  margin: bigint;
};

type WsClient = {
  send: (data: string) => void;
};

const clients = new Set<WsClient>();
const positionsByAddress = new Map<string, Map<string, PositionState>>();

seedMarkets(env.marketId);

const app = fastify({ logger: true });

// Register error handler
app.setErrorHandler(errorHandler);

await app.register(cors, {
  origin: env.corsOrigins.length > 0 ? env.corsOrigins : false, // Don't allow all origins
  methods: ['GET', 'OPTIONS'],
  credentials: false, // Don't send credentials unless needed
  maxAge: 86400, // 24 hours preflight cache
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
});
await app.register(websocket);

// --- Basic hardening (MVP) ---
// Security headers (use @fastify/helmet in production)
app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  reply.header('Cross-Origin-Resource-Policy', 'same-site');
  return payload;
});

// Global rate limiting (applied to all routes)
app.addHook('onRequest', createRateLimitMiddleware(defaultRateLimitConfig));

function broadcast(message: WsMessage) {
  const payload = JSON.stringify(message);
  clients.forEach((client) => client.send(payload));
}

function getMarket(marketId: string) {
  return state.markets.find((market) => market.id === marketId);
}

function upsertPosition(address: string, stateUpdate: PositionState) {
  const key = address.toLowerCase();
  const map = positionsByAddress.get(key) ?? new Map<string, PositionState>();
  map.set(stateUpdate.marketId, stateUpdate);
  positionsByAddress.set(key, map);
}

function removePosition(address: string, marketId: string) {
  const key = address.toLowerCase();
  const map = positionsByAddress.get(key);
  if (!map) return;
  map.delete(marketId);
  if (map.size === 0) {
    positionsByAddress.delete(key);
  }
}

function calculatePositions(address: string): Position[] {
  const key = address.toLowerCase();
  const map = positionsByAddress.get(key);
  if (!map) return [];
  return Array.from(map.values()).map((position) => {
    const market = getMarket(position.marketId);
    const markPrice = market?.markPrice ?? 0;
    const sizeAbs = Number(formatUnits(position.size < 0n ? -position.size : position.size, 18));
    const size = position.size < 0n ? -sizeAbs : sizeAbs;
    const entryPrice = Number(formatUnits(position.entryPrice, 18));
    const margin = Number(formatUnits(position.margin, 18));
    const pnl = (markPrice - entryPrice) * size;
    const notional = Math.abs(size) * markPrice;
    const leverage = notional > 0 ? Number((notional / Math.max(margin, 1)).toFixed(2)) : 0;
    const liquidationPrice = entryPrice * (size > 0 ? 0.86 : 1.14);
    return {
      id: `${position.marketId}-${key}`,
      marketId: position.marketId,
      side: size >= 0 ? 'long' : 'short',
      size: Math.abs(size),
      entryPrice,
      markPrice,
      pnl: Number(pnl.toFixed(2)),
      margin: Number(margin.toFixed(2)),
      leverage,
      liquidationPrice: Number(liquidationPrice.toFixed(2)),
    };
  });
}

app.get('/health', async () => ({ ok: true, time: new Date().toISOString() }));

app.get('/markets', async () => state.markets);

app.get('/prices', async () => state.prices);

app.get('/orderbook', async (request) => {
  const marketId = (request.query as { market?: string })?.market || state.markets[0]?.id;
  return state.orderbooks.get(marketId ?? '') ?? { bids: [], asks: [] };
});

app.get(
  '/orderbook/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam]),
  },
  async (request) => {
  const { marketId } = request.params as { marketId: string };
  return state.orderbooks.get(marketId) ?? { bids: [], asks: [] };
  }
);

app.get(
  '/trades/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam]),
  },
  async (request) => {
  const { marketId } = request.params as { marketId: string };
  return state.trades.get(marketId) ?? [];
  }
);

app.get(
  '/positions/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam]),
  },
  async (request) => {
  const { address } = request.params as { address: string };
    return calculatePositions(address);
  }
);

app.get(
  '/orders',
  {
    preHandler: createValidationMiddleware([validateAddressQuery]),
  },
  async (request) => {
  const address = (request.query as { address?: string })?.address;
    if (!address) return [];
  return getOrders(address);
  }
);

// History endpoints
app.get(
  '/history/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam, validatePaginationQuery]),
  },
  async (request) => {
  const { address } = request.params as { address: string };

  const pool = getPool();
  try {
    const [tradesRes, positionsRes] = await Promise.all([
      pool.query(
        `SELECT market_id, side, size, price, pnl, fee, created_at, tx_hash
         FROM trades WHERE address = $1 ORDER BY created_at DESC LIMIT 100`,
        [address.toLowerCase()]
      ),
      pool.query(
        `SELECT market_id, side, size, entry_price, exit_price, margin, pnl, leverage, opened_at, closed_at
         FROM positions_history WHERE address = $1 AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 50`,
        [address.toLowerCase()]
      ),
    ]);

    return {
      trades: tradesRes.rows.map((row: any) => ({
        id: row.tx_hash,
        marketId: row.market_id,
        side: row.side,
        size: Number(row.size),
        price: Number(row.price),
        pnl: row.pnl ? Number(row.pnl) : null,
        fee: row.fee ? Number(row.fee) : null,
        closedAt: row.created_at.toISOString(),
      })),
      positions: positionsRes.rows.map((row: any) => ({
        id: `${row.market_id}-${row.opened_at}`,
        marketId: row.market_id,
        side: row.side,
        size: Number(row.size),
        entryPrice: Number(row.entry_price),
        exitPrice: Number(row.exit_price),
        pnl: Number(row.pnl),
        margin: Number(row.margin),
        leverage: row.leverage,
        closedAt: row.closed_at.toISOString(),
      })),
    };
  } catch (err) {
    console.error('History query failed:', err);
    return { trades: [], positions: [] };
  }
});

// V2 API Endpoints
app.get('/v2/markets', async () => {
  const pool = getPool();
  try {
    // Get markets from database or contract state
    // For now, return basic structure
    return state.markets.map((m) => ({
      ...m,
      oiCap: null, // Would need to read from contract
      exposureCap: null, // Would need to read from contract
    }));
  } catch (err) {
    console.error('V2 Markets query failed:', err);
    return [];
  }
});

app.get(
  '/v2/orderbook/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam]),
  },
  async (request) => {
    const { marketId } = request.params as { marketId: string };
    const pool = getPool();
  try {
    // Get V2 orderbook from database
    const result = await pool.query(
      `SELECT order_id, side, size, filled, price, status, auction_state
       FROM v2_orders
       WHERE market_id = $1 AND status IN ('live', 'queued_for_auction')
       ORDER BY price DESC, created_at ASC`,
      [marketId]
    );

    // Build orderbook structure
    const bids: any[] = [];
    const asks: any[] = [];

    for (const row of result.rows) {
      const level = {
        price: Number(row.price),
        size: Number(row.size) - Number(row.filled || 0),
        total: Number(row.size),
      };
      if (row.side === 'buy') {
        bids.push(level);
      } else {
        asks.push(level);
      }
    }

    return { bids, asks, auctionState: null }; // Would need to read auction state
  } catch (err) {
    console.error('V2 Orderbook query failed:', err);
    return { bids: [], asks: [], auctionState: null };
  }
});

app.get(
  '/v2/trades/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam, validatePaginationQuery]),
  },
  async (request) => {
    const { marketId } = request.params as { marketId: string };
    const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT order_id, maker_address, taker_address, side, size, price, maker_fee, taker_fee, is_maker, created_at
       FROM v2_trades
       WHERE market_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [marketId]
    );

    return result.rows.map((row: any) => ({
      id: row.order_id?.toString() || '',
      time: row.created_at.toISOString(),
      price: Number(row.price),
      size: Number(row.size),
      side: row.side,
      makerFee: row.maker_fee ? Number(row.maker_fee) : null,
      takerFee: row.taker_fee ? Number(row.taker_fee) : null,
      isMaker: row.is_maker,
    }));
  } catch (err) {
    console.error('V2 Trades query failed:', err);
    return [];
  }
});

app.get(
  '/v2/positions/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam]),
  },
  async (request) => {
    const { address } = request.params as { address: string };

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT market_id, size, entry_price, funding_entry, opened_at
       FROM v2_positions
       WHERE address = $1 AND closed_at IS NULL`,
      [address.toLowerCase()]
    );

    // Would need to read current price and calculate PnL/funding
    return result.rows.map((row: any) => ({
      id: `${row.market_id}-${row.opened_at}`,
      marketId: row.market_id,
      side: Number(row.size) >= 0 ? 'long' : 'short',
      size: Math.abs(Number(row.size)),
      entryPrice: Number(row.entry_price),
      fundingEntry: Number(row.funding_entry),
      pnl: null, // Would need to calculate
      fundingPayment: null, // Would need to calculate
      liquidationPrice: null, // Would need to calculate
    }));
  } catch (err) {
    console.error('V2 Positions query failed:', err);
    return [];
  }
});

app.get(
  '/v2/orders/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam]),
  },
  async (request) => {
    const { address } = request.params as { address: string };

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT order_id, market_id, side, type, mode, size, filled, price, trigger_price, status, auction_state, created_at
       FROM v2_orders
       WHERE address = $1 AND status IN ('live', 'queued_for_auction', 'trigger_pending')
       ORDER BY created_at DESC`,
      [address.toLowerCase()]
    );

    return result.rows.map((row: any) => ({
      id: row.order_id.toString(),
      marketId: row.market_id,
      side: row.side,
      type: row.type,
      mode: row.mode,
      size: Number(row.size),
      filled: Number(row.filled || 0),
      price: row.price ? Number(row.price) : null,
      triggerPrice: row.trigger_price ? Number(row.trigger_price) : null,
      status: row.status,
      auctionState: row.auction_state,
      createdAt: row.created_at.toISOString(),
    }));
  } catch (err) {
    console.error('V2 Orders query failed:', err);
    return [];
  }
});

app.get(
  '/v2/vault/deposits/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam, validatePaginationQuery]),
  },
  async (request) => {
    const { address } = request.params as { address: string };

  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT assets, shares, created_at, tx_hash
       FROM vault_deposits
       WHERE address = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [address.toLowerCase()]
    );

    return result.rows.map((row: any) => ({
      assets: Number(row.assets),
      shares: Number(row.shares),
      createdAt: row.created_at.toISOString(),
      txHash: row.tx_hash,
    }));
  } catch (err) {
    console.error('Vault deposits query failed:', err);
    return [];
  }
});

app.get(
  '/v2/vault/shares/:address',
  {
    preHandler: createValidationMiddleware([validateAddressParam]),
  },
  async (request) => {
    const { address } = request.params as { address: string };

  const pool = getPool();
  try {
    // Get total shares and assets from vault contract
    // For now, return from database
    const deposits = await pool.query(
      `SELECT SUM(shares) as total_shares
       FROM vault_deposits
       WHERE address = $1`,
      [address.toLowerCase()]
    );

    const withdrawals = await pool.query(
      `SELECT SUM(shares) as total_withdrawn
       FROM vault_withdrawals
       WHERE address = $1`,
      [address.toLowerCase()]
    );

    const shares = Number(deposits.rows[0]?.total_shares || 0) - Number(withdrawals.rows[0]?.total_withdrawn || 0);

    return {
      shares,
      value: 0, // Would need to read from contract
      sharePrice: 0, // Would need to read from contract
    };
  } catch (err) {
    console.error('Vault shares query failed:', err);
    return { shares: 0, value: 0, sharePrice: 0 };
  }
});

app.get('/v2/insurance/state', async () => {
  const pool = getPool();
  try {
    const result = await pool.query('SELECT balance, last_updated_at FROM insurance_fund_state WHERE id = 1');
    if (result.rows.length === 0) {
      return { balance: 0, lastUpdatedAt: null };
    }
    return {
      balance: Number(result.rows[0].balance),
      lastUpdatedAt: result.rows[0].last_updated_at?.toISOString() || null,
    };
  } catch (err) {
    console.error('Insurance fund state query failed:', err);
    return { balance: 0, lastUpdatedAt: null };
  }
});

app.get(
  '/v2/auction/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam, validatePaginationQuery]),
  },
  async (request) => {
    const { marketId } = request.params as { marketId: string };
    const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT clearing_price, orders_touched, buy_volume, sell_volume, matched_volume, created_at, tx_hash
       FROM auction_history
       WHERE market_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [marketId]
    );

    return result.rows.map((row: any) => ({
      clearingPrice: Number(row.clearing_price),
      ordersTouched: row.orders_touched,
      buyVolume: Number(row.buy_volume),
      sellVolume: Number(row.sell_volume),
      matchedVolume: Number(row.matched_volume),
      createdAt: row.created_at.toISOString(),
      txHash: row.tx_hash,
    }));
  } catch (err) {
    console.error('Auction history query failed:', err);
    return [];
  }
});

app.get(
  '/funding/:marketId',
  {
    preHandler: createValidationMiddleware([validateMarketIdParam]),
  },
  async (request) => {
  const { marketId } = request.params as { marketId: string };
  const pool = getPool();
  
  try {
    const result = await pool.query(
      `SELECT rate, cumulative_rate, created_at
       FROM funding_history WHERE market_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [marketId]
    );
    
    return result.rows.map((row: any) => ({
      time: row.created_at.toISOString(),
      rate: Number(row.rate),
      cumulativeRate: Number(row.cumulative_rate),
    }));
  } catch (err) {
    console.error('Funding history query failed:', err);
    return [];
  }
});

app.get('/ws', { websocket: true }, (connection) => {
  const client = {
    send: (data: string) => connection.socket.send(data),
  };
  clients.add(client);

  const snapshot: WsMessage[] = [
    { type: 'markets', data: state.markets },
    { type: 'prices', data: state.prices },
  ];
  snapshot.forEach((msg) => client.send(JSON.stringify(msg)));

  connection.socket.on('close', () => {
    clients.delete(client);
  });
});

async function fetchPrices() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.priceFeedTimeoutMs);
    const response = await fetch(env.priceFeedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return;
    const data = (await response.json()) as PriceFeed;
    if (!data?.ethereum?.usd) return;
    updatePrices(data);
    broadcast({ type: 'prices', data });
    broadcast({ type: 'markets', data: state.markets });
  } catch {
    // Keep last known prices when feed is unavailable.
  }
}

function tickMarkets() {
  state.markets.forEach((market) => {
    bumpMarket(market.id);
    updateOrderbook(market.id);
    appendTrade(market.id);
    const orderbook = state.orderbooks.get(market.id) as Orderbook;
    const trades = state.trades.get(market.id) as Trade[];
    broadcast({ type: 'orderbook', marketId: market.id, data: orderbook });
    broadcast({ type: 'trades', marketId: market.id, data: trades });
  });
  broadcast({ type: 'markets', data: state.markets });
}

async function startEventWatchers() {
  if (!env.rpcUrl || !env.engineAddress || !env.oracleAddress) {
    app.log.warn('RPC or contract addresses missing; skipping on-chain watchers.');
    return;
  }

  const client = createPublicClient({
    chain: sepolia,
    transport: http(env.rpcUrl),
  });

  client.watchContractEvent({
    address: env.oracleAddress as `0x${string}`,
    abi: ORACLE_ABI,
    eventName: 'PriceUpdated',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
        const price = Number(formatUnits(log.args.price as bigint, 18));
        const market = state.markets.find((m) => m.id === marketId);
        if (!market) return;
        market.indexPrice = price;
        market.markPrice = price * 1.001;
      });
      broadcast({ type: 'markets', data: state.markets });
    },
  });

  client.watchContractEvent({
    address: env.engineAddress as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionOpened',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
        upsertPosition(log.args.account as string, {
          marketId,
          size: log.args.size as bigint,
          entryPrice: log.args.entryPrice as bigint,
          margin: log.args.margin as bigint,
        });
        broadcast({
          type: 'positions',
          address: log.args.account as string,
          data: calculatePositions(log.args.account as string),
        });
      });
    },
  });

  client.watchContractEvent({
    address: env.engineAddress as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionUpdated',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
        upsertPosition(log.args.account as string, {
          marketId,
          size: log.args.size as bigint,
          entryPrice: log.args.entryPrice as bigint,
          margin: log.args.margin as bigint,
        });
        broadcast({
          type: 'positions',
          address: log.args.account as string,
          data: calculatePositions(log.args.account as string),
        });
      });
    },
  });

  client.watchContractEvent({
    address: env.engineAddress as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'PositionClosed',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
        removePosition(log.args.account as string, marketId);
        broadcast({
          type: 'positions',
          address: log.args.account as string,
          data: calculatePositions(log.args.account as string),
        });
      });
    },
  });

  client.watchContractEvent({
    address: env.engineAddress as `0x${string}`,
    abi: ENGINE_ABI,
    eventName: 'Liquidated',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
        removePosition(log.args.account as string, marketId);
        broadcast({
          type: 'positions',
          address: log.args.account as string,
          data: calculatePositions(log.args.account as string),
        });
      });
    },
  });

  if (env.orderbookAddress) {
    client.watchContractEvent({
      address: env.orderbookAddress as `0x${string}`,
      abi: ORDERBOOK_ABI,
      eventName: 'OrderCreated',
      onLogs: (logs) => {
        logs.forEach((log) => {
          const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
          const sizeDelta = log.args.sizeDelta as bigint;
          const order: Order = {
            id: (log.args.orderId as bigint).toString(),
            marketId,
            address: log.args.owner as string,
            side: sizeDelta >= 0n ? 'buy' : 'sell',
            type: log.args.isStop ? 'stop' : 'limit',
            size: Number(formatUnits(sizeDelta >= 0n ? sizeDelta : -sizeDelta, 18)),
            filled: 0,
            triggerPrice: Number(formatUnits(log.args.triggerPrice as bigint, 18)),
            leverage: Number(log.args.leverage as bigint),
            reduceOnly: Boolean(log.args.reduceOnly),
            status: 'open',
            createdAt: new Date().toISOString(),
          };
          upsertOrder(order);
          broadcast({ type: 'orders', address: order.address, data: getOrders(order.address) });
        });
      },
    });

    client.watchContractEvent({
      address: env.orderbookAddress as `0x${string}`,
      abi: ORDERBOOK_ABI,
      eventName: 'OrderCancelled',
      onLogs: (logs) => {
        logs.forEach((log) => {
          const orderId = (log.args.orderId as bigint).toString();
          updateOrderStatus(orderId, 'cancelled');
          const owner = log.args.owner as string;
          broadcast({ type: 'orders', address: owner, data: getOrders(owner) });
        });
      },
    });

    client.watchContractEvent({
      address: env.orderbookAddress as `0x${string}`,
      abi: ORDERBOOK_ABI,
      eventName: 'OrderExecuted',
      onLogs: (logs) => {
        logs.forEach((log) => {
          const orderId = (log.args.orderId as bigint).toString();
          updateOrderStatus(orderId, 'filled');
          const owner = log.args.owner as string;
          broadcast({ type: 'orders', address: owner, data: getOrders(owner) });

          const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
          const sizeDelta = log.args.sizeDelta as bigint;
          const executionPrice = Number(formatUnits(log.args.executionPrice as bigint, 18));
          const trade: Trade = {
            id: `${Date.now()}-${orderId}`,
            time: new Date().toISOString(),
            price: executionPrice,
            size: Number(formatUnits(sizeDelta >= 0n ? sizeDelta : -sizeDelta, 18)),
            side: sizeDelta >= 0n ? 'buy' : 'sell',
          };
          const trades = state.trades.get(marketId) ?? [];
          state.trades.set(marketId, [trade, ...trades].slice(0, 20));
          broadcast({ type: 'trades', marketId, data: state.trades.get(marketId) as Trade[] });
        });
      },
    });
  }
}

async function startOracleKeeper() {
  if (!env.keeperPrivateKey || !env.oracleAddress || !env.rpcUrl) {
    return;
  }
  const account = privateKeyToAccount(env.keeperPrivateKey as `0x${string}`);
  const client = createWalletClient({
    chain: sepolia,
    transport: http(env.rpcUrl),
    account,
  });
  const marketId = stringToHex(env.marketId, { size: 32 });

  setInterval(async () => {
    const price = state.prices?.ethereum?.usd ?? state.markets[0]?.indexPrice;
    if (!price) return;
    try {
      await client.writeContract({
        address: env.oracleAddress as `0x${string}`,
        abi: ORACLE_ABI,
        functionName: 'setPrice',
        args: [marketId, parseUnits(price.toFixed(2), 18)],
      });
    } catch {
      // Keeper updates are best-effort.
    }
  }, 45_000);
}

// Load secrets from secrets manager (optional)
try {
  await loadSecrets();
} catch (err) {
  console.warn('Secrets loading failed (using env vars):', err);
}

// Initialize database and indexers
try {
  await initDb();
  // Start V1 indexer in background (non-blocking)
  startIndexer().catch((err) => {
    console.error('V1 Indexer error:', err);
  });
  // Start V2 indexer in background (non-blocking)
  startIndexerV2().catch((err) => {
    console.error('V2 Indexer error:', err);
  });
} catch (err) {
  console.warn('Database/indexer initialization failed:', err);
}

setInterval(fetchPrices, 30_000);
setInterval(tickMarkets, 3_000);

await startEventWatchers();
await startOracleKeeper();

// Start V1 keeper services
startOrderbookKeeper().catch((err) => {
  console.error('Orderbook Keeper error:', err);
});
startLiquidationKeeper().catch((err) => {
  console.error('Liquidation Keeper error:', err);
});
startFundingKeeper().catch((err) => {
  console.error('Funding Keeper error:', err);
});

// Start V2 keeper services
startAuctionKeeper().catch((err) => {
  console.error('Auction Keeper error:', err);
});
startStopTriggerKeeper().catch((err) => {
  console.error('Stop Trigger Keeper error:', err);
});
startFundingKeeperV2().catch((err) => {
  console.error('V2 Funding Keeper error:', err);
});
startLiquidationKeeperV2().catch((err) => {
  console.error('V2 Liquidation Keeper error:', err);
});
startOracleRouterKeeper().catch((err) => {
  console.error('Oracle Router Keeper error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeDb();
  await app.close();
  process.exit(0);
});

await app.listen({ port: env.port, host: '0.0.0.0' });
