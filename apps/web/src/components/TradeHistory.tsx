import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { API_URL } from '../lib/api';
import { formatNumber, formatUsd } from '../lib/format';

type HistoricalTrade = {
  id: string;
  marketId: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fee: number;
  closedAt: string;
};

// Mock historical trades for demo
const mockHistoricalTrades: HistoricalTrade[] = [
  {
    id: '1',
    marketId: 'ETH-USD',
    side: 'long',
    size: 0.5,
    entryPrice: 3180,
    exitPrice: 3220,
    pnl: 20,
    fee: 1.6,
    closedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    marketId: 'ETH-USD',
    side: 'short',
    size: 0.3,
    entryPrice: 3250,
    exitPrice: 3210,
    pnl: 12,
    fee: 0.97,
    closedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: '3',
    marketId: 'BTC-USD',
    side: 'long',
    size: 0.02,
    entryPrice: 62500,
    exitPrice: 62100,
    pnl: -8,
    fee: 1.25,
    closedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: '4',
    marketId: 'ETH-USD',
    side: 'long',
    size: 1.2,
    entryPrice: 3100,
    exitPrice: 3190,
    pnl: 108,
    fee: 3.8,
    closedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

type TradeHistoryProps = {
  address?: string;
};

export default function TradeHistory({ address: addressProp }: TradeHistoryProps = {}) {
  const { address: connectedAddress, isConnected } = useAccount();
  const address = addressProp || connectedAddress;
  const [trades, setTrades] = useState<HistoricalTrade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      if (!address) {
        setTrades([]);
        return;
      }

      setLoading(true);
      try {
        // Try to fetch from API, fall back to mock data
        const res = await fetch(`${API_URL}/history/${address}`);
        if (res.ok) {
          const data = await res.json();
          setTrades(data);
        } else {
          setTrades(mockHistoricalTrades);
        }
      } catch {
        // Use mock data when API is unavailable
        setTrades(mockHistoricalTrades);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [address]);

  // Calculate summary stats
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);
  const winRate = trades.length > 0 
    ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 
    : 0;

  function formatTime(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  if (!isConnected) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">History</p>
            <h3>Trade History</h3>
          </div>
        </div>
        <p className="muted small">Connect wallet to view trade history.</p>
      </div>
    );
  }

  return (
    <div className="panel trade-history-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">History</p>
          <h3>Trade History</h3>
        </div>
        <div className="history-stats">
          <span className={totalPnl >= 0 ? 'text-positive' : 'text-negative'}>
            {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl, 2)}
          </span>
        </div>
      </div>

      <div className="history-summary">
        <div className="summary-stat">
          <span className="label">Total P&L</span>
          <span className={totalPnl >= 0 ? 'text-positive' : 'text-negative'}>
            {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl, 2)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="label">Win Rate</span>
          <span>{formatNumber(winRate, 1)}%</span>
        </div>
        <div className="summary-stat">
          <span className="label">Total Fees</span>
          <span className="muted">{formatUsd(totalFees, 2)}</span>
        </div>
        <div className="summary-stat">
          <span className="label">Trades</span>
          <span>{trades.length}</span>
        </div>
      </div>

      {loading ? (
        <p className="muted small">Loading history...</p>
      ) : trades.length === 0 ? (
        <p className="muted small">No trade history yet.</p>
      ) : (
        <div className="history-list">
          <div className="history-head">
            <span>Market</span>
            <span>Side</span>
            <span>Size</span>
            <span>Entry</span>
            <span>Exit</span>
            <span>P&L</span>
            <span>Time</span>
          </div>
          {trades.map((trade) => (
            <div key={trade.id} className="history-row">
              <span>{trade.marketId}</span>
              <span className={trade.side === 'long' ? 'text-positive' : 'text-negative'}>
                {trade.side.toUpperCase()}
              </span>
              <span>{formatNumber(trade.size, 4)}</span>
              <span>{formatUsd(trade.entryPrice, 2)}</span>
              <span>{formatUsd(trade.exitPrice, 2)}</span>
              <span className={trade.pnl >= 0 ? 'text-positive' : 'text-negative'}>
                {trade.pnl >= 0 ? '+' : ''}{formatUsd(trade.pnl, 2)}
              </span>
              <span className="muted">{formatTime(trade.closedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

