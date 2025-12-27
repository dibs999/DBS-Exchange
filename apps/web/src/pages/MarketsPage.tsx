import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../hooks/useMarketData';
import { formatCompact, formatPct, formatUsd } from '../lib/format';
import { MARKET_ID_STRING } from '../contracts';
import MarketStrip from '../components/MarketStrip';
import { MarketStripSkeleton } from '../components/LoadingSkeleton';

const featureCards = [
  {
    title: 'Unified margin',
    detail: 'Cross-collateralized accounts with real-time risk checks and configurable leverage caps.',
    tag: 'Risk engine',
  },
  {
    title: 'Oracle-driven pricing',
    detail: 'Owner-updated oracle feeds with guardrails to keep mark and index prices aligned.',
    tag: 'On-chain',
  },
  {
    title: 'Low-latency API',
    detail: 'Socket streaming for trades and depth, ready for advanced order types.',
    tag: 'Realtime',
  },
];

export default function MarketsPage() {
  const navigate = useNavigate();
  const [activeMarketId, setActiveMarketId] = useState(MARKET_ID_STRING);
  const { markets, activeMarket, prices, status, isLoadingSnapshot } = useMarketData(activeMarketId);

  const priceHeadline = useMemo(() => {
    const eth = prices.ethereum?.usd ?? activeMarket?.markPrice ?? 0;
    const change = prices.ethereum?.change24h ?? activeMarket?.change24h ?? 0;
    return {
      price: formatUsd(eth, 2),
      change,
    };
  }, [prices, activeMarket]);

  const spreadStats = useMemo(() => {
    if (!activeMarket?.indexPrice) {
      return { abs: 0, pct: 0 };
    }
    const abs = (activeMarket.markPrice ?? 0) - activeMarket.indexPrice;
    const pct = (abs / activeMarket.indexPrice) * 100;
    return { abs, pct };
  }, [activeMarket]);

  const heroStats = useMemo(() => {
    return [
      {
        label: 'Open interest',
        value: activeMarket ? formatCompact(activeMarket.openInterest) : '--',
      },
      {
        label: 'Funding (1h)',
        value: activeMarket ? formatPct(activeMarket.fundingRate * 100) : '--',
      },
      {
        label: '24h Volume',
        value: activeMarket ? formatCompact(activeMarket.volume24h) : '--',
      },
    ];
  }, [activeMarket]);

  const handleMarketSelect = (marketId: string) => {
    setActiveMarketId(marketId);
    navigate(`/trade?market=${marketId}`);
  };

  return (
    <>
      {/* Market Overview Header */}
      <section className="market-overview">
        <div className="market-header">
          <div className="market-title">
            <h1 className="market-symbol">{activeMarket?.symbol ?? 'ETH/USD'}</h1>
            <div className="market-subtitle">
              <span className={`price-change ${priceHeadline.change >= 0 ? 'positive' : 'negative'}`}>
                {formatPct(priceHeadline.change)}
              </span>
              <span className="muted small">24h</span>
            </div>
          </div>
          <div className="market-price">
            <div className="price-main">{priceHeadline.price}</div>
            <div className="price-details">
              <span className="muted small">Mark: {activeMarket ? formatUsd(activeMarket.markPrice, 2) : '--'}</span>
              <span className="muted small">Index: {activeMarket ? formatUsd(activeMarket.indexPrice, 2) : '--'}</span>
            </div>
          </div>
          <div className="market-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="stat-item">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-value">{stat.value}</span>
              </div>
            ))}
            <div className="stat-item">
              <span className="stat-label">Spread</span>
              <span className="stat-value">
                {formatUsd(spreadStats.abs, 2)} ({formatPct(spreadStats.pct)})
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Markets Section */}
      <section className="markets-section">
        <div className="markets-header">
          <h2>Markets</h2>
          {status ? <p className="status warn">{status}</p> : null}
        </div>
        {isLoadingSnapshot ? (
          <MarketStripSkeleton />
        ) : (
          <MarketStrip markets={markets} activeId={activeMarketId} onSelect={handleMarketSelect} />
        )}
      </section>

      {/* Features Section */}
      <section className="section features">
        {featureCards.map((card, idx) => (
          <div key={card.title} className="feature-card" style={{ ['--delay' as string]: `${idx * 0.08}s` }}>
            <p className="eyebrow">{card.tag}</p>
            <h3>{card.title}</h3>
            <p className="muted">{card.detail}</p>
          </div>
        ))}
      </section>
    </>
  );
}

