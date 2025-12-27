import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useMarketData } from '../hooks/useMarketData';
import { MARKET_ID_STRING } from '../contracts';
import PortfolioAnalytics from '../components/PortfolioAnalytics';
import Positions from '../components/Positions';
import OpenOrders from '../components/OpenOrders';
import TradeHistory from '../components/TradeHistory';
import WalletButton from '../components/WalletButton';
import { PositionsSkeleton } from '../components/LoadingSkeleton';

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [activeMarketId] = useState(MARKET_ID_STRING);
  const { positions, orders, isLoadingSnapshot } = useMarketData(activeMarketId, address);
  const [terminalTab, setTerminalTab] = useState<'positions' | 'orders' | 'history'>('positions');

  if (!isConnected || !address) {
    return (
      <section className="section">
        <div className="connect-prompt" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2>Connect Wallet</h2>
          <p className="muted" style={{ marginBottom: '2rem' }}>
            Connect your wallet to view your portfolio, positions, and trading history.
          </p>
          <WalletButton />
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Portfolio Analytics */}
      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h2>Account Overview</h2>
          </div>
        </div>
        <PortfolioAnalytics address={address} />
      </section>

      {/* Positions, Orders, History Tabs */}
      <section className="section">
        <div className="terminal-bottom">
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
            {terminalTab === 'positions' &&
              (isLoadingSnapshot ? <PositionsSkeleton /> : <Positions data={positions} />)}
            {terminalTab === 'orders' && <OpenOrders data={orders} />}
            {terminalTab === 'history' && <TradeHistory address={address} />}
          </div>
        </div>
      </section>
    </>
  );
}

