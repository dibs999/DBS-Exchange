import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createPublicClient, createWalletClient, formatUnits, hexToString, http, isAddress, parseUnits, privateKeyToAccount, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { ENGINE_ABI, ORDERBOOK_ABI, ORACLE_ABI } from './abi';
import { env } from './config';
import { appendTrade, bumpMarket, getOrders, seedMarkets, state, updateOrderStatus, updateOrderbook, updatePrices, upsertOrder } from './store';
import { Market, Order, Orderbook, Position, PriceFeed, Trade, WsMessage } from '@dbs/shared';

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

await app.register(cors, { origin: true });
await app.register(websocket);

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

app.get('/orderbook/:marketId', async (request) => {
  const { marketId } = request.params as { marketId: string };
  return state.orderbooks.get(marketId) ?? { bids: [], asks: [] };
});

app.get('/trades/:marketId', async (request) => {
  const { marketId } = request.params as { marketId: string };
  return state.trades.get(marketId) ?? [];
});

app.get('/positions/:address', async (request) => {
  const { address } = request.params as { address: string };
  if (!isAddress(address)) {
    return [];
  }
  return calculatePositions(address);
});

app.get('/orders', async (request) => {
  const address = (request.query as { address?: string })?.address;
  if (!address || !isAddress(address)) return [];
  return getOrders(address);
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
    const response = await fetch(env.priceFeedUrl);
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

setInterval(fetchPrices, 30_000);
setInterval(tickMarkets, 3_000);

await startEventWatchers();
await startOracleKeeper();

await app.listen({ port: env.port, host: '0.0.0.0' });
