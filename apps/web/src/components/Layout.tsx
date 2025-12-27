import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import WalletButton from './WalletButton';
import NetworkBanner from './NetworkBanner';
import DepositWithdrawModal from './DepositWithdrawModal';
import FaucetModal from './FaucetModal';
import SettingsModal from './SettingsModal';
import OnboardingModal from './OnboardingModal';
import { ToastProvider } from './Toast';
import { SettingsProvider } from '../lib/settings';
import { ModalProvider, useModal } from '../lib/modalContext';
import { useI18n } from '../lib/i18n';

interface LayoutProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutProps) {
  const location = useLocation();
  const { isConnected } = useAccount();
  const { t } = useI18n();
  const { depositOpen, withdrawOpen, faucetOpen, setDepositOpen, setWithdrawOpen, setFaucetOpen } = useModal();

  // Other modal states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Check if onboarding should be shown
  useEffect(() => {
    const hasCompleted = localStorage.getItem('dbs-onboarding-completed');
    if (!hasCompleted && isConnected) {
      setOnboardingOpen(true);
    }
  }, [isConnected]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'd':
          if (isConnected) setDepositOpen(true);
          break;
        case 'w':
          if (isConnected) setWithdrawOpen(true);
          break;
        case ',':
          setSettingsOpen(true);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === '/trade';
    }
    return location.pathname.startsWith(path);
  };

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
              <Link to="/" className={isActive('/') ? 'active' : ''} aria-label="Trade">
                Trade
              </Link>
              <Link to="/markets" className={isActive('/markets') ? 'active' : ''} aria-label="Markets">
                Markets
              </Link>
              <Link to="/portfolio" className={isActive('/portfolio') ? 'active' : ''} aria-label="Portfolio">
                Portfolio
              </Link>
              <Link to="/vault" className={isActive('/vault') ? 'active' : ''} aria-label="Vaults">
                Vault
              </Link>
              <Link to="/analytics" className={isActive('/analytics') ? 'active' : ''} aria-label="Analytics">
                Analytics
              </Link>
            </nav>
            <div className="nav-actions">
              <span className={`pill status-pill ${isConnected ? 'positive' : 'negative'}`} style={{ display: 'none' }}>
                {/* WebSocket status would be shown here if needed */}
              </span>
              <button
                className="btn ghost"
                onClick={() => setSettingsOpen(true)}
                title={`${t('modal.settings.title')} (,)`}
                aria-label={t('modal.settings.title')}
              >
                ⚙️
              </button>
              <button className="btn ghost" aria-label="Docs">
                Docs
              </button>
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

          <main>{children}</main>

          <footer className="footer">
            <div className="footer-brand">
              <span className="brand-dot" />
              <span>DBS Exchange</span>
            </div>
            <div className="footer-links">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">
                Docs
              </a>
              <a href="https://discord.gg" target="_blank" rel="noopener noreferrer">
                Discord
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                Twitter
              </a>
            </div>
            <div className="footer-info">
              <span className="muted small">Base Mainnet</span>
              <span className="muted small">•</span>
              <span className="muted small">v0.1.0-beta</span>
            </div>
          </footer>

          {/* Modals */}
          <DepositWithdrawModal mode="deposit" isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
          <DepositWithdrawModal mode="withdraw" isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
          <FaucetModal isOpen={faucetOpen} onClose={() => setFaucetOpen(false)} />
          <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
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

export default function Layout({ children }: LayoutProps) {
  return (
    <ModalProvider>
      <LayoutContent>{children}</LayoutContent>
    </ModalProvider>
  );
}

