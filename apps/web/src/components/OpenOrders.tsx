import React from 'react';
import { Order } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';

export default function OpenOrders({ data }: { data: Order[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Orders</p>
          <h3>Open & recent</h3>
        </div>
        <button className="chip ghost">Live</button>
      </div>
      <div className="orders-head">
        <span>ID</span>
        <span>Type</span>
        <span>Side</span>
        <span>Size</span>
        <span>Trigger</span>
        <span>Status</span>
      </div>
      {data.length === 0 ? (
        <p className="muted small">No open orders yet.</p>
      ) : (
        data.map((order) => (
          <div key={order.id} className="orders-row">
            <span>#{order.id.slice(-6)}</span>
            <span>{order.type}</span>
            <span className={order.side === 'buy' ? 'text-positive' : 'text-negative'}>{order.side}</span>
            <span>{formatNumber(order.size, 4)}</span>
            <span>{order.triggerPrice ? formatUsd(order.triggerPrice, 2) : '--'}</span>
            <span>{order.status}</span>
          </div>
        ))
      )}
    </div>
  );
}
