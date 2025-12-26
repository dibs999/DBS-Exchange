import React from 'react';
import { Orderbook } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';

export default function OrderBook({ data }: { data: Orderbook }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order book</p>
          <h3>Depth & liquidity</h3>
        </div>
      </div>
      <div className="orderbook-grid">
        <div>
          <div className="orderbook-head">
            <span>Bid price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {data.bids.map((row, idx) => (
            <div key={`bid-${idx}`} className="orderbook-row bid">
              <span>{formatUsd(row.price, 2)}</span>
              <span>{formatNumber(row.size, 3)}</span>
              <span>{formatNumber(row.total, 3)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="orderbook-head">
            <span>Ask price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {data.asks.map((row, idx) => (
            <div key={`ask-${idx}`} className="orderbook-row ask">
              <span>{formatUsd(row.price, 2)}</span>
              <span>{formatNumber(row.size, 3)}</span>
              <span>{formatNumber(row.total, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
