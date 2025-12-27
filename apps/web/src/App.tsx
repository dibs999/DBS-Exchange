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
import PortfolioAnalytics from './components/PortfolioAnalytics';
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
    const hasCompleted = localStorage.getItem('dbs-onboarding-completed');
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
                <p className="brand-title">DBS Exchange</p>
                <span className="pill subtle">DBS V2</span>
              </div>
              <p className="muted small">Base perps desk</p>
            </div>
          </div>
          <nav className="nav">
            <a href="#terminal" aria-label="Trade">Trade</a>
            <a href="#markets" aria-label="Markets">Markets</a>
            <a href="#portfolio" aria-label="Portfolio">Portfolio</a>
            <a href="#liquidity" aria-label="Vaults">Vaults</a>
            <a href="#risk" aria-label="Risk">Risk</a>
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
            <button className="btn ghost" aria-label="Docs">Docs</button>
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
                <div className="stat-item">
                  <span className="stat-label">24h Volume</span>
                  <span className="stat-value">{activeMarket ? formatCompact(activeMarket.volume24h) : '--'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Open Interest</span>
                  <span className="stat-value">{activeMarket ? formatCompact(activeMarket.openInterest) : '--'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Funding (1h)</span>
                  <span className={`stat-value ${activeMarket && activeMarket.fundingRate < 0 ? 'negative' : 'positive'}`}>
                    {activeMarket ? formatPct(activeMarket.fundingRate * 100) : '--'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Spread</span>
                  <span className="stat-value">{formatUsd(spreadStats.abs, 2)} ({formatPct(spreadStats.pct)})</span>
                </div>
              </div>
              <div className="market-actions">
                <span className={`status-indicator ${isWsConnected ? 'live' : 'offline'}`}>
                  <span className="pulse-dot" aria-hidden />
                  {isWsConnected ? 'Live' : 'Offline'}
                </span>
                {!isConnected && (
                  <div className="wallet-prompt">
                    <WalletButton />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Markets Section - Compact */}
          <section className="markets-section" id="markets">
            <div className="markets-header">
              <h2>Markets</h2>
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

          {/* Trading Terminal */}
          <section className="terminal" id="terminal">
            <div className="terminal-layout">
              {/* Left Column: Chart */}
              <div className="terminal-left">
                <div className="chart-container">
                  <TradingViewChart symbol={activeMarket?.symbol ?? 'ETHUSD'} />
                </div>
              </div>

              {/* Center Column: Orderbook & Trades */}
              <div className="terminal-center">
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

              {/* Right Column: Order Entry + Account */}
              <div className="terminal-right">
                <div className="order-entry-container">
                  <OrderEntry 
                    marketId={activeMarketId}
                    markPrice={activeMarket?.markPrice ?? 0}
                    prefill={ticketPrefill}
                  />
                </div>
                {isConnected && address ? (
                  <AccountPanel 
                    positions={positions}
                    onDeposit={() => setDepositModalOpen(true)}
                    onWithdraw={() => setWithdrawModalOpen(true)}
                    onFaucet={() => setFaucetModalOpen(true)}
                  />
                ) : (
                  <div className="connect-prompt">
                    <h3>Connect Wallet</h3>
                    <p className="muted">Connect your wallet to start trading</p>
                    <WalletButton />
                  </div>
                )}
              </div>
            </div>

            <div className="terminal-bottom" id="portfolio">
              {isConnected && address ? (
                <>
                  <div className="terminal-tabs">
                    <button 
                      className={`tab ${terminalTab === 'positions' ? 'active' : ''}`}
                      onClick={() => setTerminalTab('positions')}
                    >
                      Positions
                    </button>
                    <button 
                      className={`tab ${terminalTab === 'orders' ? 'active' : ''}`}
                      onClick={() => setTerminalTab('orders')}
                    >
                      Orders
                    </button>
                    <button 
                      className={`tab ${terminalTab === 'history' ? 'active' : ''}`}
                      onClick={() => setTerminalTab('history')}
                    >
                      History
                    </button>
                  </div>
                  <div className="terminal-content">
                    {terminalTab === 'positions' && (
                      isLoadingSnapshot ? <PositionsSkeleton /> : <Positions data={positions} />
                    )}
                    {terminalTab === 'orders' && (
                      <OpenOrders data={orders} />
                    )}
                    {terminalTab === 'history' && (
                      <TradeHistory address={address} />
                    )}
                  </div>
                </>
              ) : (
                <div className="connect-prompt">
                  <h3>Connect Wallet</h3>
                  <p className="muted">Connect your wallet to view positions and history.</p>
                  <WalletButton />
                </div>
              )}
            </div>
          </section>

          {/* Legacy Grid Layout (fallback) */}
          <div className="terminal-grid" style={{ display: 'none' }}>
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
            <span>DBS Exchange</span>
          </div>
          <div className="footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Docs</a>
            <a href="https://discord.gg" target="_blank" rel="noopener noreferrer">Discord</a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
          </div>
          <div className="footer-info">
            <span className="muted small">Base Mainnet</span>
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
