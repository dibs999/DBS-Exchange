export type Market = {
  id: string;
  base: string;
  quote: string;
  symbol: string;
  tvSymbol: string;
  markPrice: number;
  indexPrice: number;
  change24h: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
};

export type OrderbookLevel = {
  price: number;
  size: number;
  total: number;
};

export type Orderbook = {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
};

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'open' | 'filled' | 'cancelled';

export type Order = {
  id: string;
  marketId: string;
  address: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  filled: number;
  triggerPrice?: number;
  leverage: number;
  reduceOnly: boolean;
  status: OrderStatus;
  createdAt: string;
};

export type Trade = {
  id: string;
  time: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
};

export type Position = {
  id: string;
  marketId: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  margin: number;
  leverage: number;
  liquidationPrice: number;
};

export type PriceFeed = Record<string, { usd: number; change24h?: number }>;

export type WsMessage =
  | { type: 'markets'; data: Market[] }
  | { type: 'orderbook'; marketId: string; data: Orderbook }
  | { type: 'trades'; marketId: string; data: Trade[] }
  | { type: 'positions'; address: string; data: Position[] }
  | { type: 'orders'; address: string; data: Order[] }
  | { type: 'prices'; data: PriceFeed }
  | { type: 'v2:orderbook'; marketId: string; data: Orderbook & { auctionState?: unknown } }
  | { type: 'v2:trades'; marketId: string; data: Trade[] }
  | { type: 'v2:positions'; address: string; data: Position[] }
  | { type: 'v2:orders'; address: string; data: Order[] }
  | { type: 'v2:auction'; marketId: string; data: unknown };
