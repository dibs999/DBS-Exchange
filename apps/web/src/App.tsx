import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useMarketData } from './hooks/useMarketData';
import { formatCompact, formatPct, formatUsd } from './lib/format';
import MarketStrip from './components/MarketStrip';
import TradingViewChart from './components/TradingViewChart';
import OrderBook from './components/OrderBook';
import Trades from './components/Trades';
import Positions from './components/Positions';
import OrderEntry from './components/OrderEntry';
import OpenOrders from './components/OpenOrders';
import WalletButton from './components/WalletButton';
import AccountPanel from './components/AccountPanel';
import DepositWithdrawModal from './components/DepositWithdrawModal';
import FaucetModal from './components/FaucetModal';
import TradeHistory from './components/TradeHistory';
import FundingChart from './components/FundingChart';
import LPVault from './components/LPVault';
import SettingsModal from './components/SettingsModal';
import NetworkBanner from './components/NetworkBanner';
import OnboardingModal from './components/OnboardingModal';
import { ToastProvider } from './components/Toast';
import { SettingsProvider } from './lib/settings';
import { useI18n } from './lib/i18n';
import { MARKET_ID_STRING } from './contracts';
import { AccountPanelSkeleton, MarketStripSkeleton, OrderbookSkeleton, PositionsSkeleton } from './components/LoadingSkeleton';

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
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [activeMarketId, setActiveMarketId] = useState(MARKET_ID_STRING);
  const {
    markets,
    activeMarket,
    orderbook,
    trades,
    positions,
    orders,
    prices,
    status,
    isLoadingSnapshot,
    isWsConnected,
  } = useMarketData(activeMarketId, address);

  // Modal states
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [ticketPrefill, setTicketPrefill] = useState<{ price: number; side: 'bid' | 'ask'; key: number } | null>(null);
  const { t } = useI18n();

  // Check if onboarding should be shown
  useEffect(() => {
    const hasCompleted = localStorage.getItem('obsidian-onboarding-completed');
    if (!hasCompleted && isConnected) {
      setOnboardingOpen(true);
    }
  }, [isConnected]);

  // Tab states
  const [terminalTab, setTerminalTab] = useState<'positions' | 'orders' | 'history'>('positions');

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'd':
          if (isConnected) setDepositModalOpen(true);
          break;
        case 'w':
          if (isConnected) setWithdrawModalOpen(true);
          break;
        case ',':
          setSettingsOpen(true);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected]);

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

  const spreadStats = useMemo(() => {
    if (!activeMarket?.indexPrice) {
      return { abs: 0, pct: 0 };
    }
    const abs = (activeMarket.markPrice ?? 0) - activeMarket.indexPrice;
    const pct = (abs / activeMarket.indexPrice) * 100;
    return { abs, pct };
  }, [activeMarket]);

  const shortAddress = useMemo(() => {
    if (!address) return null;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const greetingLine = isConnected
    ? 'Wallet verbunden – lade Testguthaben oder spring direkt ins Terminal.'
    : 'Verbinde dein Wallet, erhalte Test-oUSD und starte sofort ins Orderbuch.';

  return (
    <ToastProvider>
      <SettingsProvider>
        <div className="app">
        <div className="grid-overlay" aria-hidden="true" />
        <NetworkBanner />
        
        <header className="topbar">
          <div className="brand">
            <span className="brand-dot" />
            <div className="brand-copy">
              <div className="brand-row">
                <p className="brand-title">Obsidian Drift</p>
                <span className="pill subtle">Hyperliquid-inspired</span>
              </div>
              <p className="muted small">Sepolia perps lab</p>
            </div>
          </div>
          <nav className="nav">
            <a href="#terminal" aria-label={t('nav.terminal')}>{t('nav.terminal')}</a>
            <a href="#markets" aria-label={t('nav.markets')}>{t('nav.markets')}</a>
            <a href="#liquidity" aria-label={t('nav.liquidity')}>{t('nav.liquidity')}</a>
            <a href="#risk" aria-label={t('nav.risk')}>{t('nav.risk')}</a>
          </nav>
          <div className="nav-actions">
            <span className={`pill status-pill ${isWsConnected ? 'positive' : 'negative'}`}>
              <span className="pulse-dot" aria-hidden />
              {isWsConnected ? 'Live feed' : 'Cached view'}
            </span>
            <button 
              className="btn ghost" 
              onClick={() => setSettingsOpen(true)} 
              title={`${t('modal.settings.title')} (,)`}
              aria-label={t('modal.settings.title')}
            >
              ⚙️
            </button>
            <button className="btn ghost" aria-label={t('nav.docs')}>{t('nav.docs')}</button>
            <button 
              className="btn ghost" 
              onClick={() => setOnboardingOpen(true)}
              title="Onboarding"
              aria-label="Show onboarding"
            >
              ?
            </button>
            <WalletButton />
          </div>
        </header>

        <main>
          <section className="hero">
            <div className="hero-left">
              <div className="hero-topline">
                <span className="pill neon">DBS Exchange</span>
                <span className="pill outline">Sepolia</span>
                <span className={`pill status-pill ${isWsConnected ? 'positive' : 'negative'}`}>
                  <span className="pulse-dot" aria-hidden />
                  {isWsConnected ? 'Live-Orderbuch' : 'Snapshot-Ansicht'}
                </span>
              </div>
              <p className="eyebrow">Welcome to the vault</p>
              <h1>Willkommen bei Obsidian Drift</h1>
              <p className="hero-lead">{greetingLine}</p>
              <div className="hero-actions">
                <button className="btn primary" onClick={() => document.getElementById('terminal')?.scrollIntoView({ behavior: 'smooth' })}>
                  Zum Terminal
                </button>
                <button className="btn secondary" onClick={() => setFaucetModalOpen(true)}>
                  Testnet-Faucet
                </button>
                <button className="btn ghost" onClick={() => setDepositModalOpen(true)} disabled={!isConnected}>
                  Collateral einzahlen
                </button>
              </div>
              <div className="hero-badges">
                <span className="pill outline">TradingView integriert</span>
                <span className="pill outline">Cross-Margin Engine</span>
                <span className="pill outline">WalletConnect ready</span>
              </div>
              <div className="hero-metrics">
                <div className="metric highlight">
                  <p className="label">Wallet</p>
                  <strong>{isConnected ? 'Verbunden' : 'Nicht verbunden'}</strong>
                  <p className="muted small">{isConnected ? shortAddress : 'MetaMask & WalletConnect werden unterstützt.'}</p>
                </div>
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
              <div className="hero-card price-card">
                <div className="hero-card-head">
                  <div>
                    <p className="label">ETH index</p>
                    <h2>{priceHeadline.price}</h2>
                  </div>
                  <span className={`pill ${priceHeadline.change >= 0 ? 'pill-up' : 'pill-down'}`}>
                    {priceHeadline.change >= 0 ? 'Bullish' : 'Cooling'}
                  </span>
                </div>
                <div className="price-row">
                  <div>
                    <p className="muted small">Mark</p>
                    <strong>{activeMarket ? formatUsd(activeMarket.markPrice, 2) : '--'}</strong>
                  </div>
                  <div>
                    <p className="muted small">Index</p>
                    <strong>{activeMarket ? formatUsd(activeMarket.indexPrice, 2) : '--'}</strong>
                  </div>
                  <div className={`change-chip ${priceHeadline.change >= 0 ? 'positive' : 'negative'}`}>
                    {formatPct(priceHeadline.change)}
                  </div>
                </div>
                <div className="hero-card-divider" />
                <div className="hero-card-foot">
                  <div>
                    <p className="label">Collateral token</p>
                    <h3>oUSD</h3>
                    <p className="muted small">Minted for Sepolia testing.</p>
                  </div>
                  <div className="pill ghost">Latency tuned</div>
                </div>
              </div>
              <div className="hero-card connect-card" id="connect-card">
                <div className="connect-card-head">
                  <div>
                    <p className="label">Sofort loslegen</p>
                    <h3>Verbinde dein Wallet hier im Hero.</h3>
                  </div>
                  <span className="pill ghost">{isConnected ? 'Bereit' : 'One-tap'}</span>
                </div>
                <p className="muted small">
                  Wir begrüßen dich mit einem aufgeräumten, echten Exchange-Gefühl – inklusive WalletConnect-Unterstützung und direktem Zugriff auf das Orderbuch.
                </p>
                <div className="wallet-connect-inline">
                  <WalletButton />
                </div>
                <div className="connect-foot">
                  <span className="pill outline">oUSD Collateral</span>
                  <span className="pill outline">Cross-Margin</span>
                  <span className="pill outline">Funding synced</span>
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
            {isLoadingSnapshot ? (
              <MarketStripSkeleton />
            ) : (
              <MarketStrip markets={markets} activeId={activeMarketId} onSelect={setActiveMarketId} />
            )}
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
                <div className="terminal-tags">
                  <span className="pill outline">Cross-margin</span>
                  <span className="pill outline">Low latency</span>
                  <span className="pill outline">Oracle synced</span>
                </div>
              </div>
              <div className="terminal-actions">
                <button className="btn ghost" onClick={() => setFaucetModalOpen(true)}>Faucet</button>
                <button className="btn secondary" onClick={() => setWithdrawModalOpen(true)}>Withdraw</button>
                <button className="btn primary" onClick={() => setDepositModalOpen(true)}>Deposit</button>
              </div>
            </div>

            <div className="terminal-meta">
              <div>
                <p className="label">Spread</p>
                <strong>{formatUsd(spreadStats.abs, 2)} <span className="muted small">({formatPct(spreadStats.pct)})</span></strong>
              </div>
              <div>
                <p className="label">Open interest</p>
                <strong>{activeMarket ? formatCompact(activeMarket.openInterest) : '--'}</strong>
              </div>
              <div>
                <p className="label">Funding (1h)</p>
                <strong>{activeMarket ? formatPct(activeMarket.fundingRate * 100) : '--'}</strong>
              </div>
              <div>
                <p className="label">24h Volume</p>
                <strong>{activeMarket ? formatCompact(activeMarket.volume24h) : '--'}</strong>
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
                  
                  {terminalTab === 'positions' &&
                    (isLoadingSnapshot ? <PositionsSkeleton /> : <Positions data={positions} />)}
                  {terminalTab === 'orders' && <OpenOrders data={orders} />}
                  {terminalTab === 'history' && <TradeHistory />}
                </div>
              </div>

              <div className="side-panels">
                {isLoadingSnapshot ? (
                  <AccountPanelSkeleton />
                ) : (
                  <AccountPanel 
                    positions={positions}
                    onDeposit={() => setDepositModalOpen(true)}
                    onWithdraw={() => setWithdrawModalOpen(true)}
                    onFaucet={() => setFaucetModalOpen(true)}
                  />
                )}
                <OrderEntry
                  marketId={activeMarket?.id ?? MARKET_ID_STRING}
                  markPrice={activeMarket?.markPrice ?? 0}
                  prefill={ticketPrefill}
                />
                {isLoadingSnapshot ? (
                  <OrderbookSkeleton />
                ) : (
                  <OrderBook
                    data={orderbook}
                    onPriceClick={(price, side) => {
                      setTicketPrefill({ price, side, key: Date.now() });
                    }}
                  />
                )}
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
                  <strong>8.4M oUSD</strong>
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

        <footer className="footer">
          <div className="footer-brand">
            <span className="brand-dot" />
            <span>Obsidian Drift</span>
          </div>
          <div className="footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Docs</a>
            <a href="https://discord.gg" target="_blank" rel="noopener noreferrer">Discord</a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
          </div>
          <div className="footer-info">
            <span className="muted small">Sepolia Testnet</span>
            <span className="muted small">•</span>
            <span className="muted small">v0.1.0-beta</span>
          </div>
        </footer>

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
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
        <OnboardingModal
          isOpen={onboardingOpen}
          onClose={() => setOnboardingOpen(false)}
          onComplete={() => setOnboardingOpen(false)}
        />
        </div>
      </SettingsProvider>
    </ToastProvider>
  );
}
