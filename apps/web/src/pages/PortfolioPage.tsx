import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useMarketData } from '../hooks/useMarketData';
import { useMarketDataV2 } from '../hooks/useMarketDataV2';
import { MARKET_ID_STRING } from '../contracts';
import { ENGINE_V2_READY, MARKET_ID_V2_STRING, ORDERBOOK_V2_READY } from '../contracts-v2';
import PortfolioAnalytics from '../components/PortfolioAnalytics';
import Positions from '../components/Positions';
import PositionsV2 from '../components/PositionsV2';
import OpenOrders from '../components/OpenOrders';
import OpenOrdersV2 from '../components/OpenOrdersV2';
import TradeHistory from '../components/TradeHistory';
import WalletButton from '../components/WalletButton';
import { PositionsSkeleton } from '../components/LoadingSkeleton';

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const useV2 = ENGINE_V2_READY && ORDERBOOK_V2_READY;
  const [activeMarketId] = useState(useV2 ? MARKET_ID_V2_STRING : MARKET_ID_STRING);
  const v1 = useMarketData(activeMarketId, address);
  const v2 = useMarketDataV2(activeMarketId, address);
  const data = useV2 ? v2 : v1;
  const { positions, orders, isLoadingSnapshot } = data;
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
        {!useV2 ? (
          <PortfolioAnalytics positions={positions} />
        ) : (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Portfolio Analytics</p>
                <h3>Coming soon</h3>
              </div>
            </div>
            <p className="muted">V2 analytics will be available once historical indexing is complete.</p>
          </div>
        )}
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
            {!useV2 && (
              <button
                className={`tab ${terminalTab === 'history' ? 'active' : ''}`}
                onClick={() => setTerminalTab('history')}
              >
                History
              </button>
            )}
          </div>
          <div className="terminal-content">
            {terminalTab === 'positions' &&
              (isLoadingSnapshot ? (
                <PositionsSkeleton />
              ) : useV2 ? (
                <PositionsV2 data={positions} />
              ) : (
                <Positions data={positions} />
              ))}
            {terminalTab === 'orders' && (useV2 ? <OpenOrdersV2 data={orders} /> : <OpenOrders data={orders} />)}
            {!useV2 && terminalTab === 'history' && <TradeHistory address={address} />}
          </div>
        </div>
      </section>
    </>
  );
}
