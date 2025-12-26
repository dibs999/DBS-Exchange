import React, { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useMarketData } from './hooks/useMarketData';
import { formatCompact, formatNumber, formatPct, formatUsd } from './lib/format';
import MarketStrip from './components/MarketStrip';
import TradingViewChart from './components/TradingViewChart';
import OrderBook from './components/OrderBook';
import Trades from './components/Trades';
import Positions from './components/Positions';
import PerpsCard from './components/PerpsCard';
import OrderEntry from './components/OrderEntry';
import OpenOrders from './components/OpenOrders';
import WalletButton from './components/WalletButton';
import AccountPanel from './components/AccountPanel';
import DepositWithdrawModal from './components/DepositWithdrawModal';
import FaucetModal from './components/FaucetModal';
import TradeHistory from './components/TradeHistory';
import FundingChart from './components/FundingChart';
import LPVault from './components/LPVault';
import { ToastProvider } from './components/Toast';
import { MARKET_ID_STRING } from './contracts';

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

export default function App() {
  const { address } = useAccount();
  const [activeMarketId, setActiveMarketId] = useState(MARKET_ID_STRING);
  const { markets, activeMarket, orderbook, trades, positions, orders, prices, status } = useMarketData(
    activeMarketId,
    address
  );

  // Modal states
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [faucetModalOpen, setFaucetModalOpen] = useState(false);

  // Tab states
  const [terminalTab, setTerminalTab] = useState<'positions' | 'orders' | 'history'>('positions');

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

  const priceHeadline = useMemo(() => {
    const eth = prices.ethereum?.usd ?? activeMarket?.markPrice ?? 0;
    const change = prices.ethereum?.change24h ?? activeMarket?.change24h ?? 0;
    return {
      price: formatUsd(eth, 2),
      change,
    };
  }, [prices, activeMarket]);

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-dot" />
            <div>
              <p className="brand-title">Obsidian Drift</p>
              <p className="muted small">DEX - Perps Engine</p>
            </div>
          </div>
          <nav className="nav">
            <a href="#terminal">Terminal</a>
            <a href="#markets">Markets</a>
            <a href="#liquidity">Liquidity</a>
            <a href="#risk">Risk</a>
          </nav>
          <div className="nav-actions">
            <button className="btn ghost">Docs</button>
            <WalletButton />
          </div>
        </header>

        <main>
          <section className="hero">
            <div className="hero-left">
              <p className="eyebrow">Sepolia testnet perpetuals</p>
              <h1>
                Trade in the dark,
                <span> settle in gold.</span>
              </h1>
              <p className="muted">
                Obsidian Drift is a modular perps exchange with on-chain margin, oracle-indexed pricing, and
                streamlined risk controls. Built for rapid experimentation on Sepolia.
              </p>
              <div className="hero-actions">
                <button className="btn primary" onClick={() => document.getElementById('terminal')?.scrollIntoView({ behavior: 'smooth' })}>
                  Start trading
                </button>
                <button className="btn ghost">View architecture</button>
              </div>
              <div className="hero-metrics">
                {heroStats.map((stat, idx) => (
                  <div key={stat.label} className="metric" style={{ ['--delay' as string]: `${idx * 0.08}s` }}>
                    <p className="label">{stat.label}</p>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-glow" />
              <div className="hero-card">
                <div>
                  <p className="label">ETH index</p>
                  <h2>{priceHeadline.price}</h2>
                  <span className={priceHeadline.change >= 0 ? 'text-positive' : 'text-negative'}>
                    {formatPct(priceHeadline.change)}
                  </span>
                </div>
                <div className="hero-card-divider" />
                <div>
                  <p className="label">Collateral token</p>
                  <h3>oUSD</h3>
                  <p className="muted small">Minted for Sepolia testing.</p>
                </div>
              </div>
              <div className="hero-cta">
                <p className="eyebrow">Liquidity vault</p>
                <h3>Seed a liquidity vault and earn protocol yield.</h3>
                <button className="btn secondary" onClick={() => document.getElementById('liquidity')?.scrollIntoView({ behavior: 'smooth' })}>
                  Deposit liquidity
                </button>
              </div>
            </div>
          </section>

          <section className="section" id="markets">
            <div className="section-head">
              <div>
                <p className="eyebrow">Market heat</p>
                <h2>Cross-asset markets</h2>
              </div>
              {status ? <p className="status warn">{status}</p> : null}
            </div>
            <MarketStrip markets={markets} activeId={activeMarketId} onSelect={setActiveMarketId} />
          </section>

          <section className="section features" id="risk">
            {featureCards.map((card, idx) => (
              <div key={card.title} className="feature-card" style={{ ['--delay' as string]: `${idx * 0.08}s` }}>
                <p className="eyebrow">{card.tag}</p>
                <h3>{card.title}</h3>
                <p className="muted">{card.detail}</p>
              </div>
            ))}
          </section>

          <section className="terminal" id="terminal">
            <div className="terminal-head">
              <div>
                <p className="eyebrow">Perpetuals terminal</p>
                <h2>{activeMarket?.symbol ?? 'ETH/USD'}</h2>
                <p className="muted">Mark {activeMarket ? formatUsd(activeMarket.markPrice, 2) : '--'} / Index {activeMarket ? formatUsd(activeMarket.indexPrice, 2) : '--'}</p>
              </div>
              <div className="terminal-actions">
                <button className="btn ghost" onClick={() => setFaucetModalOpen(true)}>Faucet</button>
                <button className="btn secondary" onClick={() => setWithdrawModalOpen(true)}>Withdraw</button>
                <button className="btn primary" onClick={() => setDepositModalOpen(true)}>Deposit</button>
              </div>
            </div>

            <div className="terminal-grid">
              <div className="chart-column">
                <div className="chart-panel">
                  <TradingViewChart symbol={activeMarket?.tvSymbol ?? 'BINANCE:ETHUSDT'} />
                </div>
                
                <div className="bottom-panels">
                  <div className="bottom-tabs">
                    <button 
                      className={terminalTab === 'positions' ? 'active' : ''} 
                      onClick={() => setTerminalTab('positions')}
                    >
                      Positions ({positions.length})
                    </button>
                    <button 
                      className={terminalTab === 'orders' ? 'active' : ''} 
                      onClick={() => setTerminalTab('orders')}
                    >
                      Open Orders ({orders.length})
                    </button>
                    <button 
                      className={terminalTab === 'history' ? 'active' : ''} 
                      onClick={() => setTerminalTab('history')}
                    >
                      History
                    </button>
                  </div>
                  
                  {terminalTab === 'positions' && <Positions data={positions} />}
                  {terminalTab === 'orders' && <OpenOrders data={orders} />}
                  {terminalTab === 'history' && <TradeHistory />}
                </div>
              </div>

              <div className="side-panels">
                <AccountPanel 
                  positions={positions}
                  onDeposit={() => setDepositModalOpen(true)}
                  onWithdraw={() => setWithdrawModalOpen(true)}
                  onFaucet={() => setFaucetModalOpen(true)}
                />
                <OrderEntry marketId={activeMarket?.id ?? MARKET_ID_STRING} markPrice={activeMarket?.markPrice ?? 0} />
                <OrderBook data={orderbook} />
                <Trades data={trades} />
              </div>
            </div>
          </section>

          <section className="section funding-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">Funding analytics</p>
                <h2>Historical rates</h2>
              </div>
            </div>
            <div className="funding-grid">
              <FundingChart 
                marketId={activeMarket?.symbol ?? 'ETH/USD'} 
                currentRate={activeMarket?.fundingRate ?? 0.004} 
              />
            </div>
          </section>

          <section className="section" id="liquidity">
            <div className="liquidity">
              <div>
                <p className="eyebrow">Protocol modules</p>
                <h2>Composable liquidity stack</h2>
                <p className="muted">
                  Plug in additional markets, customize funding curves, and pipe new price sources without rewriting the
                  core margin engine.
                </p>
              </div>
              <div className="liquidity-grid">
                <div>
                  <p className="label">Collateral vault</p>
                  <strong>{formatNumber(8.4, 1)}M oUSD</strong>
                  <p className="muted small">Allocated to liquidity buffers.</p>
                </div>
                <div>
                  <p className="label">Keepers</p>
                  <strong>3 active</strong>
                  <p className="muted small">Oracle updates + funding sync.</p>
                </div>
                <div>
                  <p className="label">Risk tiers</p>
                  <strong>Isolated / Cross</strong>
                  <p className="muted small">Configurable per market.</p>
                </div>
              </div>
            </div>

            <LPVault />
          </section>
        </main>

        {/* Modals */}
        <DepositWithdrawModal 
          mode="deposit" 
          isOpen={depositModalOpen} 
          onClose={() => setDepositModalOpen(false)} 
        />
        <DepositWithdrawModal 
          mode="withdraw" 
          isOpen={withdrawModalOpen} 
          onClose={() => setWithdrawModalOpen(false)} 
        />
        <FaucetModal 
          isOpen={faucetModalOpen} 
          onClose={() => setFaucetModalOpen(false)} 
        />
      </div>
    </ToastProvider>
  );
}
