import React from 'react';
import { Market } from '@dbs/shared';
import { formatCompact, formatPct, formatUsd } from '../lib/format';

type Props = {
  markets: Market[];
  activeId?: string;
  onSelect: (id: string) => void;
};

export default function MarketStrip({ markets, activeId, onSelect }: Props) {
  return (
    <div className="market-strip">
      {markets.map((market, idx) => (
        <button
          key={market.id}
          className={`market-card ${activeId === market.id ? 'active' : ''}`}
          style={{ ['--delay' as string]: `${idx * 0.05}s` }}
          onClick={() => onSelect(market.id)}
        >
          <div>
            <p className="label">{market.symbol}</p>
            <strong>{formatUsd(market.markPrice, 2)}</strong>
          </div>
          <div className="market-meta">
            <span className={market.change24h >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPct(market.change24h)}
            </span>
            <span className="muted small">Vol {formatCompact(market.volume24h)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
