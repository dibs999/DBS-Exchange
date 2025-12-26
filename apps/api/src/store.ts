import { Market, Order, Orderbook, OrderbookLevel, Position, PriceFeed, Trade } from '@dbs/shared';

const nowTime = () =>
  new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const DEFAULT_PRICES: PriceFeed = {
  ethereum: { usd: 3200, change24h: 1.2 },
  'usd-coin': { usd: 1, change24h: 0.0 },
};

export const state = {
  markets: [] as Market[],
  orderbooks: new Map<string, Orderbook>(),
  trades: new Map<string, Trade[]>(),
  positionsByAddress: new Map<string, Position[]>(),
  ordersByAddress: new Map<string, Order[]>(),
  ordersById: new Map<string, Order>(),
  prices: DEFAULT_PRICES,
};

export function seedMarkets(marketId: string) {
  state.markets = [
    {
      id: marketId,
      base: 'ETH',
      quote: 'USD',
      symbol: 'ETH/USD',
      tvSymbol: 'BINANCE:ETHUSDT',
      markPrice: 3200,
      indexPrice: 3194,
      change24h: 1.2,
      volume24h: 482_000_000,
      fundingRate: 0.004,
      openInterest: 92_000_000,
    },
    {
      id: 'BTC-USD',
      base: 'BTC',
      quote: 'USD',
      symbol: 'BTC/USD',
      tvSymbol: 'BINANCE:BTCUSDT',
      markPrice: 62750,
      indexPrice: 62612,
      change24h: -0.6,
      volume24h: 1_240_000_000,
      fundingRate: 0.002,
      openInterest: 220_000_000,
    },
    {
      id: 'SOL-USD',
      base: 'SOL',
      quote: 'USD',
      symbol: 'SOL/USD',
      tvSymbol: 'BINANCE:SOLUSDT',
      markPrice: 146.42,
      indexPrice: 146.05,
      change24h: 2.8,
      volume24h: 188_000_000,
      fundingRate: 0.006,
      openInterest: 31_500_000,
    },
  ];

  state.markets.forEach((market) => {
    state.orderbooks.set(market.id, generateOrderbook(market.markPrice));
    state.trades.set(market.id, generateTrades(market.markPrice));
  });
}

export function updatePrices(feed: PriceFeed) {
  state.prices = feed;
  const ethPrice = feed.ethereum?.usd ?? state.markets[0]?.markPrice ?? 3200;
  const ethChange = feed.ethereum?.change24h ?? state.markets[0]?.change24h ?? 0;
  const market = state.markets.find((m) => m.id === 'ETH-USD');
  if (market) {
    market.indexPrice = ethPrice;
    market.markPrice = ethPrice * 1.001;
    market.change24h = ethChange;
  }
}

export function generateOrderbook(price: number): Orderbook {
  const buildSide = (direction: 'bid' | 'ask') => {
    const levels: OrderbookLevel[] = [];
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      const offset = (i + 1) * (price * 0.0008);
      const levelPrice = direction === 'bid' ? price - offset : price + offset;
      const size = Number((Math.random() * 6 + 0.25).toFixed(3));
      total += size;
      levels.push({
        price: Number(levelPrice.toFixed(2)),
        size,
        total: Number(total.toFixed(3)),
      });
    }
    return levels;
  };

  return {
    bids: buildSide('bid'),
    asks: buildSide('ask'),
  };
}

export function generateTrades(price: number): Trade[] {
  return Array.from({ length: 8 }).map((_, idx) => {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const drift = price * (Math.random() * 0.001);
    const tradePrice = side === 'buy' ? price + drift : price - drift;
    return {
      id: `${Date.now()}-${idx}`,
      time: nowTime(),
      price: Number(tradePrice.toFixed(2)),
      size: Number((Math.random() * 1.2 + 0.03).toFixed(3)),
      side,
    };
  });
}

export function bumpMarket(marketId: string) {
  const market = state.markets.find((m) => m.id === marketId);
  if (!market) return;
  const delta = (Math.random() - 0.5) * market.markPrice * 0.0015;
  market.markPrice = Number((market.markPrice + delta).toFixed(2));
  market.indexPrice = Number((market.indexPrice + delta * 0.6).toFixed(2));
  market.change24h = Number((market.change24h + (Math.random() - 0.5) * 0.05).toFixed(2));
}

export function updateOrderbook(marketId: string) {
  const market = state.markets.find((m) => m.id === marketId);
  if (!market) return;
  state.orderbooks.set(marketId, generateOrderbook(market.markPrice));
}

export function appendTrade(marketId: string) {
  const market = state.markets.find((m) => m.id === marketId);
  if (!market) return;
  const trades = state.trades.get(marketId) ?? [];
  const newTrade = generateTrades(market.markPrice)[0];
  const next = [newTrade, ...trades].slice(0, 12);
  state.trades.set(marketId, next);
}

export function upsertOrder(order: Order) {
  const key = order.address.toLowerCase();
  const list = state.ordersByAddress.get(key) ?? [];
  const next = list.filter((item) => item.id !== order.id);
  next.unshift(order);
  state.ordersByAddress.set(key, next.slice(0, 50));
  state.ordersById.set(order.id, order);
}

export function updateOrderStatus(orderId: string, status: Order['status']) {
  const existing = state.ordersById.get(orderId);
  if (!existing) return;
  const updated: Order = { ...existing, status };
  upsertOrder(updated);
}

export function getOrders(address: string) {
  return state.ordersByAddress.get(address.toLowerCase()) ?? [];
}
