import React, { useMemo } from 'react';
import { Market } from '@dbs/shared';
import { formatCompact, formatPct, formatUsd } from '../lib/format';
import Sparkline, { generatePriceHistory } from './Sparkline';

type Props = {
  markets: Market[];
  activeId?: string;
  onSelect: (id: string) => void;
};

export default function MarketStrip({ markets, activeId, onSelect }: Props) {
  // Generate sparkline data for each market (in real app, this would come from API)
  const sparklineData = useMemo(() => {
    const data: Record<string, number[]> = {};
    markets.forEach((market) => {
      data[market.id] = generatePriceHistory(market.markPrice);
    });
    return data;
  }, [markets.map(m => m.id).join(',')]);

  return (
    <div className="market-strip">
      {markets.map((market, idx) => (
        <button
          key={market.id}
          className={`market-card ${activeId === market.id ? 'active' : ''}`}
          style={{ ['--delay' as string]: `${idx * 0.05}s` }}
          onClick={() => onSelect(market.id)}
        >
          <div className="market-info">
            <div className="market-header">
              <span className="market-symbol">{market.symbol}</span>
              <span className={`market-change ${market.change24h >= 0 ? 'text-positive' : 'text-negative'}`}>
              {formatPct(market.change24h)}
            </span>
            </div>
            <strong className="market-price">{formatUsd(market.markPrice, 2)}</strong>
            <div className="market-stats">
            <span className="muted small">Vol {formatCompact(market.volume24h)}</span>
              <span className="muted small">•</span>
              <span className="muted small">OI {formatCompact(market.openInterest)}</span>
            </div>
          </div>
          <div className="market-sparkline">
            <Sparkline 
              data={sparklineData[market.id] || []} 
              width={80} 
              height={32}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
