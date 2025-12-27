import React, { useState, useMemo } from 'react';
import { formatUsd, formatPct } from '../lib/format';

type Trader = {
    rank: number;
    address: string;
    pnl: number;
    pnlPct: number;
    trades: number;
    volume: number;
    winRate: number;
};

// Mock data - in production, this comes from API
const generateMockTraders = (): Trader[] => {
    const traders: Trader[] = [];
    for (let i = 1; i <= 50; i++) {
        const pnl = Math.random() > 0.3
            ? Math.random() * 100000
            : -Math.random() * 20000;
        traders.push({
            rank: i,
            address: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
            pnl,
            pnlPct: (pnl / 10000) * 100,
            trades: Math.floor(Math.random() * 500) + 10,
            volume: Math.random() * 5000000,
            winRate: 40 + Math.random() * 40,
        });
    }
    return traders.sort((a, b) => b.pnl - a.pnl);
};

type TimeFrame = 'daily' | 'weekly' | 'monthly' | 'allTime';

export default function LeaderboardPage() {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('weekly');
    const traders = useMemo(() => generateMockTraders(), [timeFrame]);

    return (
        <>
            <section className="section">
                <div className="section-head">
                    <div>
                        <p className="eyebrow">Competition</p>
                        <h2>Top Traders</h2>
                        <p className="muted">See who's making the biggest gains on DBS Exchange</p>
                    </div>
                    <div className="leaderboard-filters">
                        {(['daily', 'weekly', 'monthly', 'allTime'] as TimeFrame[]).map(tf => (
                            <button
                                key={tf}
                                className={`btn ${timeFrame === tf ? 'primary' : 'ghost'}`}
                                onClick={() => setTimeFrame(tf)}
                            >
                                {tf === 'allTime' ? 'All Time' : tf.charAt(0).toUpperCase() + tf.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Top 3 Podium */}
                <div className="leaderboard-podium" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
                    {traders.slice(0, 3).map((trader, idx) => (
                        <div
                            key={trader.address}
                            className="podium-card panel"
                            style={{
                                textAlign: 'center',
                                padding: 24,
                                background: idx === 0 ? 'linear-gradient(135deg, #312e00 0%, #1a1700 100%)' : undefined,
                                border: idx === 0 ? '1px solid #ffd700' : undefined,
                            }}
                        >
                            <div className="podium-rank" style={{ fontSize: 48, fontWeight: 'bold', color: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : '#cd7f32' }}>
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                            </div>
                            <div className="podium-address" style={{ fontFamily: 'monospace', marginTop: 8 }}>{trader.address}</div>
                            <div className={`podium-pnl ${trader.pnl >= 0 ? 'text-positive' : 'text-negative'}`} style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>
                                {trader.pnl >= 0 ? '+' : ''}{formatUsd(trader.pnl, 0)}
                            </div>
                            <div className="podium-stats muted small" style={{ marginTop: 8 }}>
                                {trader.trades} trades • {trader.winRate.toFixed(0)}% win rate
                            </div>
                        </div>
                    ))}
                </div>

                {/* Full Table */}
                <div className="panel">
                    <table className="leaderboard-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #333' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px' }}>Rank</th>
                                <th style={{ textAlign: 'left', padding: '12px 8px' }}>Trader</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px' }}>PnL</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px' }}>PnL %</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px' }}>Volume</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px' }}>Win Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {traders.map((trader, idx) => (
                                <tr key={trader.address} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>#{idx + 1}</td>
                                    <td style={{ padding: '12px 8px', fontFamily: 'monospace' }}>{trader.address}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }} className={trader.pnl >= 0 ? 'text-positive' : 'text-negative'}>
                                        {trader.pnl >= 0 ? '+' : ''}{formatUsd(trader.pnl, 0)}
                                    </td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }} className={trader.pnlPct >= 0 ? 'text-positive' : 'text-negative'}>
                                        {trader.pnlPct >= 0 ? '+' : ''}{trader.pnlPct.toFixed(1)}%
                                    </td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{formatUsd(trader.volume, 0)}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{trader.winRate.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
