import React from 'react';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({ width, height, borderRadius = 6, className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
        ...(style ?? {}),
      }}
    />
  );
}

export function SkeletonText({ lines = 1, gap = 8 }: { lines?: number; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </div>
  );
}

export function OrderbookSkeleton() {
  return (
    <div className="panel">
      <div className="panel-header">
        <Skeleton width={120} height={20} />
        <Skeleton width={60} height={16} />
      </div>
      <div className="orderbook-grid">
        <div>
          <div className="orderbook-head">
            <Skeleton width="100%" height={12} />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="orderbook-row" style={{ padding: '8px 0' }}>
              <Skeleton width="100%" height={12} />
            </div>
          ))}
        </div>
        <div>
          <div className="orderbook-head">
            <Skeleton width="100%" height={12} />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="orderbook-row" style={{ padding: '8px 0' }}>
              <Skeleton width="100%" height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PositionsSkeleton() {
  return (
    <div className="panel">
      <div className="panel-header">
        <Skeleton width={100} height={20} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Skeleton width={60} height={14} />
            <Skeleton width={40} height={14} />
            <Skeleton width={50} height={14} />
            <Skeleton width={70} height={14} />
            <Skeleton width={60} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketStripSkeleton() {
  return (
    <div className="market-strip">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="market-card" style={{ opacity: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <Skeleton width={60} height={12} />
            <Skeleton width={100} height={24} />
            <Skeleton width={120} height={10} />
          </div>
          <Skeleton width={80} height={32} borderRadius={4} />
        </div>
      ))}
    </div>
  );
}

export function AccountPanelSkeleton() {
  return (
    <div className="panel account-panel">
      <div className="panel-header">
        <div>
          <Skeleton width={80} height={12} />
          <Skeleton width={120} height={28} style={{ marginTop: 8 }} />
        </div>
        <Skeleton width={70} height={24} borderRadius={999} />
      </div>
      <div className="account-stats" style={{ marginTop: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stat-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton width={80} height={12} />
            <Skeleton width={60} height={12} />
          </div>
        ))}
      </div>
      <Skeleton width="100%" height={6} borderRadius={999} style={{ marginTop: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Skeleton width="100%" height={40} borderRadius={999} />
        <Skeleton width="100%" height={40} borderRadius={999} />
        <Skeleton width="100%" height={40} borderRadius={999} />
      </div>
    </div>
  );
}

