import React, { useMemo, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUsd, formatPct } from '../lib/format';
import { Position } from '@dbs/shared';
import { API_URL } from '../lib/api';

type Trade = {
  id: string;
  marketId: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  closedAt: string;
};

type PortfolioAnalyticsProps = {
  positions: Position[];
};

export default function PortfolioAnalytics({ positions }: PortfolioAnalyticsProps) {
  const { address, isConnected } = useAccount();
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    async function loadTrades() {
      if (!address) {
        setTrades([]);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/history/${address}`);
        if (res.ok) {
          const data = await res.json();
          // Transform API response to match our type
          const transformedTrades: Trade[] = (data.positions || []).map((p: any) => ({
            id: p.id,
            marketId: p.marketId,
            side: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            exitPrice: p.exitPrice,
            pnl: p.pnl,
            closedAt: p.closedAt,
          }));
          setTrades(transformedTrades);
        }
      } catch {
        setTrades([]);
      }
    }

    loadTrades();
  }, [address]);

  const stats = useMemo(() => {
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const totalMargin = positions.reduce((sum, p) => sum + p.margin, 0);
    const totalNotional = positions.reduce((sum, p) => sum + (p.size * p.markPrice), 0);
    
    // Calculate from trades if available
    const closedTrades = trades.filter(t => t.pnl !== undefined);
    const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const winningTrades = closedTrades.filter(t => t.pnl > 0).length;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
    const avgTrade = closedTrades.length > 0 ? totalRealizedPnl / closedTrades.length : 0;

    return {
      totalPnl,
      totalMargin,
      totalNotional,
      totalRealizedPnl,
      winRate,
      avgTrade,
      totalTrades: closedTrades.length,
      winningTrades,
    };
  }, [positions, trades]);

  if (!isConnected || !address) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Portfolio Analytics</p>
            <h3>Connect wallet</h3>
          </div>
        </div>
        <p className="muted">Connect your wallet to view portfolio analytics.</p>
      </div>
    );
  }

  return (
    <div className="panel portfolio-analytics">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Portfolio Analytics</p>
          <h3>Performance Overview</h3>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card">
          <p className="label">Total P&L</p>
          <h2 className={stats.totalPnl >= 0 ? 'text-positive' : 'text-negative'}>
            {stats.totalPnl >= 0 ? '+' : ''}{formatUsd(stats.totalPnl, 2)}
          </h2>
          <p className="muted small">
            {stats.totalRealizedPnl !== 0 && (
              <>Realized: {formatUsd(stats.totalRealizedPnl, 2)}</>
            )}
          </p>
        </div>

        <div className="analytics-card">
          <p className="label">Total Margin</p>
          <h3>{formatUsd(stats.totalMargin, 2)}</h3>
          <p className="muted small">
            Notional: {formatUsd(stats.totalNotional, 2)}
          </p>
        </div>

        {stats.totalTrades > 0 && (
          <>
            <div className="analytics-card">
              <p className="label">Win Rate</p>
              <h3 className={stats.winRate >= 50 ? 'text-positive' : 'text-negative'}>
                {stats.winRate.toFixed(1)}%
              </h3>
              <p className="muted small">
                {stats.winningTrades}W / {stats.totalTrades - stats.winningTrades}L
              </p>
            </div>

            <div className="analytics-card">
              <p className="label">Avg Trade</p>
              <h3 className={stats.avgTrade >= 0 ? 'text-positive' : 'text-negative'}>
                {stats.avgTrade >= 0 ? '+' : ''}{formatUsd(stats.avgTrade, 2)}
              </h3>
              <p className="muted small">
                {stats.totalTrades} trades
              </p>
            </div>
          </>
        )}
      </div>

      {stats.totalTrades === 0 && (
        <div className="analytics-empty">
          <p className="muted">No closed trades yet. Start trading to see analytics.</p>
        </div>
      )}
    </div>
  );
}

