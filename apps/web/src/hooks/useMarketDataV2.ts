import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Market, Order, Orderbook, Position, PriceFeed, Trade, WsMessage } from '@dbs/shared';
import { API_URL, getWsUrl, secureFetch } from '../lib/api';

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
];

const fallbackOrderbook: Orderbook = {
  bids: [],
  asks: [],
};

const fallbackTrades: Trade[] = [];

const fallbackPrices: PriceFeed = {
  ethereum: { usd: 3200, change24h: 1.2 },
  'usd-coin': { usd: 1, change24h: 0 },
};

export function useMarketDataV2(activeMarketId: string, address?: string) {
  const { address: accountAddress } = useAccount();
  const [markets, setMarkets] = useState<Market[]>(fallbackMarkets);
  const [orderbook, setOrderbook] = useState<Orderbook>(fallbackOrderbook);
  const [trades, setTrades] = useState<Trade[]>(fallbackTrades);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<PriceFeed>(fallbackPrices);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [auctionState, setAuctionState] = useState<{ inProgress: boolean; nextAuctionAt: number | null } | null>(null);

  const activeMarket = useMemo(
    () => markets.find((market) => market.id === activeMarketId) ?? markets[0],
    [markets, activeMarketId]
  );

  useEffect(() => {
    let mounted = true;
    async function loadSnapshot() {
      setIsLoadingSnapshot(true);
      try {
        const [marketsRes, pricesRes, orderbookRes, tradesRes] = await Promise.all([
          secureFetch(`${API_URL}/v2/markets`),
          secureFetch(`${API_URL}/prices`),
          secureFetch(`${API_URL}/v2/orderbook/${activeMarketId}`),
          secureFetch(`${API_URL}/v2/trades/${activeMarketId}`),
        ]);
        if (!mounted) return;
        if (marketsRes.ok) setMarkets(await marketsRes.json());
        if (pricesRes.ok) setPrices(await pricesRes.json());
        if (orderbookRes.ok) {
          const ob = await orderbookRes.json();
          setOrderbook(ob);
          setAuctionState(ob.auctionState);
        }
        if (tradesRes.ok) setTrades(await tradesRes.json());
        setStatus(null);
      } catch (err) {
        setStatus('Backend offline. Using local fallback data.');
      } finally {
        if (mounted) setIsLoadingSnapshot(false);
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
          secureFetch(`${API_URL}/v2/positions/${address}`),
          secureFetch(`${API_URL}/v2/orders/${address}`),
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
    ws.onopen = () => {
      setIsWsConnected(true);
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WsMessage;
      if (message.type === 'markets') {
        setMarkets(message.data);
      }
      if (message.type === 'prices') {
        setPrices(message.data);
      }
      if (message.type === 'v2:orderbook' && message.marketId === activeMarketId) {
        setOrderbook(message.data);
        if ((message.data as any).auctionState) {
          setAuctionState((message.data as any).auctionState);
        }
      }
      if (message.type === 'v2:trades' && message.marketId === activeMarketId) {
        setTrades(message.data);
      }
      if (message.type === 'v2:positions' && address && message.address?.toLowerCase() === address.toLowerCase()) {
        setPositions(message.data);
      }
      if (message.type === 'v2:orders' && address && message.address?.toLowerCase() === address.toLowerCase()) {
        setOrders(message.data);
      }
      if (message.type === 'v2:auction' && message.marketId === activeMarketId) {
        setAuctionState(message.data as any);
      }
    };
    ws.onerror = () => {
      setIsWsConnected(false);
      setStatus('Live socket unavailable. Showing cached data.');
    };
    ws.onclose = () => {
      setIsWsConnected(false);
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
    isLoadingSnapshot,
    isWsConnected,
    auctionState,
  };
}

