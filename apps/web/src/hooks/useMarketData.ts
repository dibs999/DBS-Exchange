import { useEffect, useMemo, useState } from 'react';
import { Market, Order, Orderbook, Position, PriceFeed, Trade, WsMessage } from '@dbs/shared';
import { API_URL, getWsUrl } from '../lib/api';

const fallbackMarkets: Market[] = [
  {
    id: 'ETH-USD',
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
];

const fallbackOrderbook: Orderbook = {
  bids: Array.from({ length: 8 }).map((_, idx) => ({
    price: 3200 - idx * 1.6,
    size: 1 + idx * 0.15,
    total: 1 + idx * 0.2,
  })),
  asks: Array.from({ length: 8 }).map((_, idx) => ({
    price: 3200 + idx * 1.6,
    size: 1 + idx * 0.12,
    total: 1 + idx * 0.18,
  })),
};

const fallbackTrades: Trade[] = [
  { id: 't1', time: '09:20:14', price: 3201.2, size: 0.18, side: 'buy' },
  { id: 't2', time: '09:20:10', price: 3199.7, size: 0.42, side: 'sell' },
  { id: 't3', time: '09:20:04', price: 3200.1, size: 0.08, side: 'buy' },
];

const fallbackPrices: PriceFeed = {
  ethereum: { usd: 3200, change24h: 1.2 },
  'usd-coin': { usd: 1, change24h: 0 },
};

export function useMarketData(activeMarketId: string, address?: string) {
  const [markets, setMarkets] = useState<Market[]>(fallbackMarkets);
  const [orderbook, setOrderbook] = useState<Orderbook>(fallbackOrderbook);
  const [trades, setTrades] = useState<Trade[]>(fallbackTrades);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<PriceFeed>(fallbackPrices);
  const [status, setStatus] = useState<string | null>(null);

  const activeMarket = useMemo(
    () => markets.find((market) => market.id === activeMarketId) ?? markets[0],
    [markets, activeMarketId]
  );

  useEffect(() => {
    let mounted = true;
    async function loadSnapshot() {
      try {
        const [marketsRes, pricesRes, orderbookRes, tradesRes] = await Promise.all([
          fetch(`${API_URL}/markets`),
          fetch(`${API_URL}/prices`),
          fetch(`${API_URL}/orderbook?market=${activeMarketId}`),
          fetch(`${API_URL}/trades/${activeMarketId}`),
        ]);
        if (!mounted) return;
        if (marketsRes.ok) setMarkets(await marketsRes.json());
        if (pricesRes.ok) setPrices(await pricesRes.json());
        if (orderbookRes.ok) setOrderbook(await orderbookRes.json());
        if (tradesRes.ok) setTrades(await tradesRes.json());
        setStatus(null);
      } catch (err) {
        setStatus('Backend offline. Using local fallback data.');
      }
    }
    loadSnapshot();
    return () => {
      mounted = false;
    };
  }, [activeMarketId]);

  useEffect(() => {
    let mounted = true;
    async function loadPositions() {
      if (!address) {
        setPositions([]);
        setOrders([]);
        return;
      }
      try {
        const [positionsRes, ordersRes] = await Promise.all([
          fetch(`${API_URL}/positions/${address}`),
          fetch(`${API_URL}/orders?address=${address}`),
        ]);
        if (!mounted) return;
        if (positionsRes.ok) setPositions(await positionsRes.json());
        if (ordersRes.ok) setOrders(await ordersRes.json());
      } catch {
        if (mounted) setPositions([]);
        if (mounted) setOrders([]);
      }
    }
    loadPositions();
    return () => {
      mounted = false;
    };
  }, [address]);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WsMessage;
      if (message.type === 'markets') {
        setMarkets(message.data);
      }
      if (message.type === 'prices') {
        setPrices(message.data);
      }
      if (message.type === 'orderbook' && message.marketId === activeMarketId) {
        setOrderbook(message.data);
      }
      if (message.type === 'trades' && message.marketId === activeMarketId) {
        setTrades(message.data);
      }
      if (message.type === 'positions' && address && message.address.toLowerCase() === address.toLowerCase()) {
        setPositions(message.data);
      }
      if (message.type === 'orders' && address && message.address.toLowerCase() === address.toLowerCase()) {
        setOrders(message.data);
      }
    };
    ws.onerror = () => {
      setStatus('Live socket unavailable. Showing cached data.');
    };
    return () => {
      ws.close();
    };
  }, [activeMarketId, address]);

  return {
    markets,
    activeMarket,
    orderbook,
    trades,
    positions,
    orders,
    prices,
    status,
  };
}
