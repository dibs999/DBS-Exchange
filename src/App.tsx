import React, { useMemo, useRef } from 'react';
import './App.css';

const tradingPairs = [
  { symbol: 'BTCUSDT', name: 'BTC/USDT', price: '62,745.21', change: '-2.34%' },
  { symbol: 'ETHUSDT', name: 'ETH/USDT', price: '3,217.12', change: '+1.12%' },
  { symbol: 'OPUSDT', name: 'OP/USDT', price: '2.107', change: '+6.51%' },
  { symbol: 'UNIUSDT', name: 'UNI/USDT', price: '9.206', change: '+7.40%' },
  { symbol: 'TIAUSDT', name: 'TIA/USDT', price: '12.407', change: '+10.50%' },
];

const orderBook = {
  asks: [
    { price: '62,755.0', size: '0.120' },
    { price: '62,754.0', size: '0.285' },
    { price: '62,753.0', size: '0.744' },
    { price: '62,752.0', size: '1.046' },
    { price: '62,751.0', size: '0.664' },
  ],
  bids: [
    { price: '62,750.0', size: '0.930' },
    { price: '62,749.0', size: '0.111' },
    { price: '62,748.0', size: '0.548' },
    { price: '62,747.0', size: '0.645' },
    { price: '62,746.0', size: '0.284' },
  ],
};

const recentTrades = [
  { time: '06:24:14', price: '62,746.5', size: '0.008', side: 'sell' },
  { time: '06:24:14', price: '62,747.0', size: '0.037', side: 'buy' },
  { time: '06:24:13', price: '62,746.0', size: '0.191', side: 'sell' },
  { time: '06:24:13', price: '62,747.0', size: '0.048', side: 'buy' },
  { time: '06:24:12', price: '62,744.0', size: '0.246', side: 'sell' },
];

const positions = [
  {
    id: '#1874128',
    pair: 'BTCUSDT',
    size: '0.50 BTC',
    entry: '64,000.0',
    mark: '62,750.5',
    liq: '59,800',
    roe: '-3.6%',
  },
];

const featureCards = [
  {
    id: 'copy',
    title: 'Copy trading',
    value: '200,000',
    detail: 'Weekly leaders with verified PnL and transparent metrics.',
    accent: 'gradient-blue',
  },
  {
    id: 'futures',
    title: 'Futures open interest',
    value: '$4.41B',
    detail: 'Deep liquidity and auto-deleveraging protections.',
    accent: 'gradient-gold',
  },
  {
    id: 'volume',
    title: '24H trading volume',
    value: '74.22B',
    detail: 'Spot and perpetual markets across 500+ pairs.',
    accent: 'gradient-aqua',
  },
];

function TradingViewChart({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      studies: ['MASimple@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    });

    container.current.appendChild(script);

    return () => {
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol]);

  return (
    <div className="tv-chart">
      <div className="tradingview-widget-container" ref={container}>
        <div className="tradingview-widget-container__widget" />
      </div>
    </div>
  );
}

function OrderBook({ asks, bids }: typeof orderBook) {
  return (
    <div className="panel orderbook">
      <div className="panel-header">
        <div>
          <p className="label">Order book</p>
          <p className="muted">Live depth and last matched price</p>
        </div>
        <span className="price-ticker">62,750.5</span>
      </div>

      <div className="orderbook-grid">
        <div>
          <div className="orderbook-head">
            <span>Price (USD)</span>
            <span>Size (BTC)</span>
          </div>
          {asks.map((row, idx) => (
            <div key={`ask-${idx}`} className="orderbook-row ask">
              <span>{row.price}</span>
              <span>{row.size}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="orderbook-head">
            <span>Price (USD)</span>
            <span>Size (BTC)</span>
          </div>
          {bids.map((row, idx) => (
            <div key={`bid-${idx}`} className="orderbook-row bid">
              <span>{row.price}</span>
              <span>{row.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Trades() {
  return (
    <div className="panel trades">
      <div className="panel-header">
        <p className="label">Trades</p>
        <button className="small-btn">All</button>
      </div>
      <div className="trades-head">
        <span>Time</span>
        <span>Price (USD)</span>
        <span>Size (BTC)</span>
      </div>
      <div className="trade-list">
        {recentTrades.map((t, idx) => (
          <div key={idx} className={`trade-row ${t.side}`}>
            <span>{t.time}</span>
            <span>{t.price}</span>
            <span>{t.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Positions() {
  return (
    <div className="panel positions">
      <div className="panel-header">
        <p className="label">Positions</p>
        <button className="small-btn ghost">Open orders</button>
      </div>
      <div className="position-head">
        <span>Pair</span>
        <span>Size</span>
        <span>Entry</span>
        <span>Mark</span>
        <span>Liq</span>
        <span>ROE</span>
      </div>
      {positions.map((p) => (
        <div key={p.id} className="position-row">
          <span>{p.pair}</span>
          <span>{p.size}</span>
          <span>{p.entry}</span>
          <span>{p.mark}</span>
          <span>{p.liq}</span>
          <span className="text-negative">{p.roe}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const primaryPair = useMemo(() => tradingPairs[0], []);

  return (
    <div className="app-root">
      <div className="top-bar">
        <div className="logo">DBS Exchange</div>
        <nav className="nav">
          <a href="#exchange">Exchange</a>
          <a href="#futures">Futures</a>
          <a href="#earn">Earn</a>
          <a href="#copy">Copy trading</a>
          <a href="#web3">Web3</a>
        </nav>
        <div className="nav-actions">
          <button className="ghost-btn">Log in</button>
          <button className="primary-btn">Sign up</button>
        </div>
      </div>

      <main className="layout">
        <section className="hero" id="exchange">
          <div className="hero-left">
            <span className="hero-chip">Premium crypto derivatives</span>
            <h1>Trade with institutional-grade liquidity.</h1>
            <p className="muted">Ultra-fast order matching, deep books, and embedded TradingView charts so you can react instantly.</p>
            <div className="hero-form">
              <input placeholder="Email/Phone number" />
              <button className="hero-cta">Start now</button>
            </div>
            <p className="hero-note">Join 120M+ users and unlock welcome rewards worth up to 5,000 USDT when you trade today.</p>
          </div>
          <div className="hero-right">
            <div className="hero-card">
              <div>
                <p className="muted">Copy trading</p>
                <h3>200,000</h3>
                <p className="pill">Weekly traders</p>
              </div>
              <div>
                <p className="muted">Current volume</p>
                <h3>74.22B</h3>
                <p className="pill pill-blue">+10% today</p>
              </div>
            </div>
            <div className="hero-markets">
              {tradingPairs.map((pair) => (
                <div key={pair.symbol} className="market-chip">
                  <div>
                    <p className="label">{pair.name}</p>
                    <strong>{pair.price}</strong>
                  </div>
                  <span className={pair.change.startsWith('-') ? 'text-negative' : 'text-positive'}>{pair.change}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="features" id="copy">
          {featureCards.map((card) => (
            <div key={card.id} className={`feature-card ${card.accent}`}>
              <div>
                <p className="muted">{card.title}</p>
                <h3>{card.value}</h3>
                <p className="muted small">{card.detail}</p>
              </div>
              <button className="link-btn">View</button>
            </div>
          ))}
        </section>

        <section className="terminal" id="futures">
          <div className="terminal-header">
            <div>
              <p className="label">Perpetual futures</p>
              <h2>{primaryPair.name}</h2>
              <p className="muted">Cross and isolated margin, 125x leverage, and dual-price liquidation protection.</p>
            </div>
            <div className="terminal-actions">
              <button className="ghost-btn">Deposit</button>
              <button className="primary-btn">Transfer</button>
            </div>
          </div>

          <div className="terminal-grid">
            <div className="chart-panel">
              <TradingViewChart symbol={`BINANCE:${primaryPair.symbol}`} />
            </div>
            <div className="side-panels">
              <OrderBook asks={orderBook.asks} bids={orderBook.bids} />
              <Trades />
              <Positions />
            </div>
          </div>
        </section>

        <section className="earn" id="earn">
          <div className="earn-card">
            <div>
              <p className="label">Earn & staking</p>
              <h3>Boost your idle balances</h3>
              <p className="muted">Launchpools, dual-invest products, and flexible savings with daily rewards.</p>
            </div>
            <button className="primary-btn">Explore Earn</button>
          </div>
          <div className="wallet-card" id="web3">
            <div>
              <p className="label">Wallet</p>
              <h3>Secure Web3 access</h3>
              <p className="muted">Manage assets, connect to dApps, and swap cross-chain with institutional security.</p>
            </div>
            <div className="wallet-stats">
              <div>
                <p className="muted">Gas price</p>
                <strong>24 gwei</strong>
              </div>
              <div>
                <p className="muted">Networks</p>
                <strong>Ethereum & Sepolia</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
