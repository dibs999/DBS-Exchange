import React from 'react';
import { Position } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';

export default function Positions({ data }: { data: Position[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Positions</p>
          <h3>Open exposure</h3>
        </div>
        <button className="chip ghost">Live</button>
      </div>
      <div className="positions-head">
        <span>Market</span>
        <span>Side</span>
        <span>Size</span>
        <span>Entry</span>
        <span>Mark</span>
        <span>PNL</span>
      </div>
      {data.length === 0 ? (
        <p className="muted small">No open positions yet.</p>
      ) : (
        data.map((pos) => (
          <div key={pos.id} className="positions-row">
            <span>{pos.marketId}</span>
            <span className={pos.side === 'long' ? 'text-positive' : 'text-negative'}>{pos.side}</span>
            <span>{formatNumber(pos.size, 4)}</span>
            <span>{formatUsd(pos.entryPrice, 2)}</span>
            <span>{formatUsd(pos.markPrice, 2)}</span>
            <span className={pos.pnl >= 0 ? 'text-positive' : 'text-negative'}>
              {formatUsd(pos.pnl, 2)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
