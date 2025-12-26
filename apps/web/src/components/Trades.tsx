import React from 'react';
import { Trade } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';

export default function Trades({ data }: { data: Trade[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Tape</p>
          <h3>Latest trades</h3>
        </div>
        <button className="chip">All</button>
      </div>
      <div className="trades-head">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="trade-list">
        {data.map((trade) => (
          <div key={trade.id} className={`trade-row ${trade.side}`}>
            <span>{trade.time}</span>
            <span>{formatUsd(trade.price, 2)}</span>
            <span>{formatNumber(trade.size, 3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
