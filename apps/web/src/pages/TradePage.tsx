import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useMarketData } from '../hooks/useMarketData';
import { useMarketDataV2 } from '../hooks/useMarketDataV2';
import { formatUsd, formatPct } from '../lib/format';
import { MARKET_ID_STRING } from '../contracts';
import { ENGINE_V2_READY, MARKET_ID_V2_STRING, ORDERBOOK_V2_READY } from '../contracts-v2';
import { useModal } from '../lib/modalContext';
import LightweightChart from '../components/LightweightChart';
import DepthChart from '../components/DepthChart';
import OrderBook from '../components/OrderBook';
import OrderBookV2 from '../components/OrderBookV2';
import Trades from '../components/Trades';
import OrderEntry from '../components/OrderEntry';
import OrderEntryV2 from '../components/OrderEntryV2';
import AccountPanel from '../components/AccountPanel';
import AccountPanelV2 from '../components/AccountPanelV2';
import { OrderbookSkeleton } from '../components/LoadingSkeleton';
import WalletButton from '../components/WalletButton';

export default function TradePage() {
  const { address, isConnected } = useAccount();
  const { openDeposit, openWithdraw, openFaucet } = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const marketParam = searchParams.get('market');
  const legacyParam = searchParams.get('legacy');
  const useV2 = !legacyParam && ENGINE_V2_READY && ORDERBOOK_V2_READY;
  const defaultMarket = useV2 ? MARKET_ID_V2_STRING : MARKET_ID_STRING;
  const [activeMarketId, setActiveMarketId] = useState(marketParam || defaultMarket);
  const [ticketPrefill, setTicketPrefill] = useState<{ price: number; side: 'bid' | 'ask'; key: number } | null>(null);
  const [chartTab, setChartTab] = useState<'price' | 'depth'>('price');

  const v1 = useMarketData(activeMarketId, address);
  const v2 = useMarketDataV2(activeMarketId, address);
  const data = useV2 ? v2 : v1;
  const {
    markets,
    activeMarket,
    orderbook,
    trades,
    positions,
    orders,
    prices,
    isLoadingSnapshot,
    isWsConnected,
  } = data;

  const priceHeadline = useMemo(() => {
    const eth = prices.ethereum?.usd ?? activeMarket?.markPrice ?? 0;
    const change = prices.ethereum?.change24h ?? activeMarket?.change24h ?? 0;
    return {
      price: formatUsd(eth, 2),
      change,
    };
  }, [prices, activeMarket]);

  const handleMarketChange = (marketId: string) => {
    setActiveMarketId(marketId);
    setSearchParams(legacyParam ? { market: marketId, legacy: legacyParam } : { market: marketId });
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
            <div className="stat-item">
              <span className="stat-label">24h Volume</span>
              <span className="stat-value">{activeMarket ? activeMarket.volume24h.toLocaleString() : '--'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Open Interest</span>
              <span className="stat-value">{activeMarket ? activeMarket.openInterest.toLocaleString() : '--'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Funding (1h)</span>
              <span className={`stat-value ${activeMarket && activeMarket.fundingRate < 0 ? 'negative' : 'positive'}`}>
                {activeMarket ? formatPct(activeMarket.fundingRate * 100) : '--'}
              </span>
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

      {/* Trading Terminal */}
      <section className="terminal">
        <div className="terminal-layout">
          {/* Left Column: Chart */}
          {/* Left Column: Chart */}
          <div className="terminal-left">
            <div className="chart-container panel">
              <div className="chart-tabs panel-header" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #333', padding: '10px' }}>
                <button
                  className={chartTab === 'price' ? 'active' : 'ghost'}
                  onClick={() => setChartTab('price')}
                  style={{ background: 'none', border: 'none', color: chartTab === 'price' ? '#fff' : '#666', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Price Chart
                </button>
                <button
                  className={chartTab === 'depth' ? 'active' : 'ghost'}
                  onClick={() => setChartTab('depth')}
                  style={{ background: 'none', border: 'none', color: chartTab === 'depth' ? '#fff' : '#666', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Depth Chart
                </button>
              </div>

              <div style={{ flex: 1, position: 'relative', height: '100%', minHeight: 400 }}>
                {chartTab === 'price' ? (
                  <LightweightChart
                    symbol={activeMarket?.symbol ?? 'ETH-USD'}
                    price={activeMarket?.markPrice ?? 0}
                    orders={orders ?? []}
                    positions={positions}
                  />
                ) : (
                  <DepthChart
                    bids={orderbook?.bids ?? []}
                    asks={orderbook?.asks ?? []}
                    currentPrice={activeMarket?.markPrice ?? 0}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Center Column: Orderbook & Trades */}
          <div className="terminal-center">
            {isLoadingSnapshot ? (
              <OrderbookSkeleton />
            ) : (
              <>
                {useV2 ? (
                  <OrderBookV2
                    data={orderbook}
                    auctionState={useV2 ? v2.auctionState : null}
                    onPriceClick={(price, side) => {
                      setTicketPrefill({ price, side, key: Date.now() });
                    }}
                  />
                ) : (
                  <OrderBook
                    data={orderbook}
                    onPriceClick={(price, side) => {
                      setTicketPrefill({ price, side, key: Date.now() });
                    }}
                  />
                )}
              </>
            )}
            <Trades data={trades} />
          </div>

          {/* Right Column: Order Entry + Account */}
          <div className="terminal-right">
            <div className="order-entry-container">
              {useV2 ? (
                <OrderEntryV2
                  marketId={activeMarketId}
                  markPrice={activeMarket?.markPrice ?? 0}
                  prefill={ticketPrefill}
                />
              ) : (
                <OrderEntry
                  marketId={activeMarketId}
                  markPrice={activeMarket?.markPrice ?? 0}
                  prefill={ticketPrefill}
                />
              )}
            </div>
            {isConnected && address ? (
              <>
                {useV2 ? (
                  <AccountPanelV2
                    positions={positions}
                    onDeposit={openDeposit}
                    onWithdraw={openWithdraw}
                  />
                ) : (
                  <AccountPanel
                    positions={positions}
                    onDeposit={openDeposit}
                    onWithdraw={openWithdraw}
                    onFaucet={openFaucet}
                  />
                )}
              </>
            ) : (
              <div className="connect-prompt">
                <h3>Connect Wallet</h3>
                <p className="muted">Connect your wallet to start trading</p>
                <WalletButton />
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
