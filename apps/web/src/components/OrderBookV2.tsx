import React, { useMemo } from 'react';
import { Orderbook } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';

type OrderBookV2Props = {
  data: Orderbook;
  auctionState?: { inProgress: boolean; nextAuctionAt: number | null } | null;
  onPriceClick?: (price: number, side: 'bid' | 'ask') => void;
};

export default function OrderBookV2({ data, auctionState, onPriceClick }: OrderBookV2Props) {
  // Calculate spread
  const spread = useMemo(() => {
    const bestBid = data.bids[0]?.price ?? 0;
    const bestAsk = data.asks[0]?.price ?? 0;
    if (bestBid === 0 || bestAsk === 0) return { absolute: 0, percent: 0 };
    const absolute = bestAsk - bestBid;
    const percent = (absolute / ((bestBid + bestAsk) / 2)) * 100;
    return { absolute, percent };
  }, [data]);

  // Calculate max total for depth visualization
  const maxTotal = useMemo(() => {
    const maxBid = data.bids[data.bids.length - 1]?.total ?? 0;
    const maxAsk = data.asks[data.asks.length - 1]?.total ?? 0;
    return Math.max(maxBid, maxAsk, 1);
  }, [data]);

  const nextAuctionTime = useMemo(() => {
    if (!auctionState?.nextAuctionAt) return null;
    const now = Date.now();
    const diff = auctionState.nextAuctionAt - now;
    if (diff <= 0) return null;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [auctionState]);

  return (
    <div className="panel orderbook-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order book (V2)</p>
          <h3>Depth & liquidity</h3>
        </div>
        <div className="orderbook-spread">
          <span className="label">Spread</span>
          <span className="spread-value">
            {formatUsd(spread.absolute, 2)} ({spread.percent.toFixed(3)}%)
          </span>
        </div>
      </div>

      {auctionState?.inProgress && (
        <div className="auction-badge">
          <span className="auction-indicator">🔄</span>
          <span>Auction in progress</span>
        </div>
      )}

      {nextAuctionTime && !auctionState?.inProgress && (
        <div className="auction-badge info">
          <span>Next auction in: {nextAuctionTime}</span>
        </div>
      )}

      <div className="orderbook-grid">
        {/* Bids (Buy orders) */}
        <div className="orderbook-side">
          <div className="orderbook-head">
            <span>Bid</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {data.bids.map((row, idx) => {
            const isMaker = (row as any).isMaker;
            return (
              <div
                key={`bid-${idx}`}
                className={`orderbook-row bid ${isMaker ? 'maker' : ''}`}
                onClick={() => onPriceClick?.(row.price, 'bid')}
                style={{ '--depth-width': `${(row.total / maxTotal) * 100}%` } as React.CSSProperties}
              >
                <span className="price">{formatUsd(row.price, 2)}</span>
                <span>{formatNumber(row.size, 3)}</span>
                <span>{formatNumber(row.total, 3)}</span>
                {isMaker && <span className="maker-badge">M</span>}
                <div className="depth-bar bid-bar" />
              </div>
            );
          })}
        </div>

        {/* Asks (Sell orders) */}
        <div className="orderbook-side">
          <div className="orderbook-head">
            <span>Ask</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {data.asks.map((row, idx) => {
            const isMaker = (row as any).isMaker;
            return (
              <div
                key={`ask-${idx}`}
                className={`orderbook-row ask ${isMaker ? 'maker' : ''}`}
                onClick={() => onPriceClick?.(row.price, 'ask')}
                style={{ '--depth-width': `${(row.total / maxTotal) * 100}%` } as React.CSSProperties}
              >
                <span className="price">{formatUsd(row.price, 2)}</span>
                <span>{formatNumber(row.size, 3)}</span>
                <span>{formatNumber(row.total, 3)}</span>
                {isMaker && <span className="maker-badge">M</span>}
                <div className="depth-bar ask-bar" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Midpoint indicator */}
      <div className="orderbook-midpoint">
        <span className="label">Mid</span>
        <span className="mid-value">
          {formatUsd(((data.bids[0]?.price ?? 0) + (data.asks[0]?.price ?? 0)) / 2, 2)}
        </span>
      </div>
    </div>
  );
}

