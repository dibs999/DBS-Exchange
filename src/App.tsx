import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WagmiConfig, useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import Swap from './Swap';
import { wagmiConfig } from './config';
import './App.css';

const featuredPairs = ['BTCUSDT', 'ETHUSDT', 'OPUSDT', 'UNIUSDT', 'TIAUSDT'];

type LiveOrderBook = {
  asks: { price: string; size: string }[];
  bids: { price: string; size: string }[];
  mark?: string;
};

type TradeRow = { time: string; price: string; size: string; side: 'buy' | 'sell' };

type GlobalStats = {
  volume: string;
  liquidity: string;
  btcPrice: string;
  updated: string;
};

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

function OrderBook({ asks, bids, mark }: LiveOrderBook) {
  return (
    <div className="panel orderbook">
      <div className="panel-header">
        <div>
          <p className="label">Order book</p>
          <p className="muted">Live depth and last matched price</p>
        </div>
        <span className="price-ticker">{mark ?? '—'}</span>
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

function Trades({ trades }: { trades: TradeRow[] }) {
  return (
    <div className="panel trades">
      <div className="panel-header">
        <p className="label">Trades (live)</p>
        <button className="small-btn">All</button>
      </div>
      <div className="trades-head">
        <span>Time</span>
        <span>Price (USD)</span>
        <span>Size (BTC)</span>
      </div>
      <div className="trade-list">
        {trades.map((t, idx) => (
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

function ProtectedPanel({ children, title }: { children: React.ReactNode; title: string }) {
  const { address, isConnected } = useAccount();
  return (
    <div className="panel protected">
      <div className="panel-header">
        <div>
          <p className="label">{title}</p>
          <p className="muted">
            {isConnected
              ? 'Ready to interact with the pools using your wallet.'
              : 'Connect a wallet to unlock trading, deposits, and transfers.'}
          </p>
        </div>
        <div className="pill">{isConnected ? address : 'Wallet required'}</div>
      </div>
      {isConnected ? children : <div className="blocked">Wallet not connected.</div>}
    </div>
  );
}

function StatsGrid({ stats }: { stats: GlobalStats | null }) {
  const cards = stats
    ? [
        { id: 'volume', title: '24H trading volume', value: stats.volume, detail: 'Across top DEX venues' },
        { id: 'liquidity', title: 'On-chain TVL', value: stats.liquidity, detail: 'Total liquidity secured' },
        { id: 'btc', title: 'BTC spot', value: stats.btcPrice, detail: 'Live Coinbase reference' },
      ]
    : [
        { id: 'volume', title: '24H trading volume', value: 'Loading…', detail: 'Across top DEX venues' },
        { id: 'liquidity', title: 'On-chain TVL', value: 'Loading…', detail: 'Total liquidity secured' },
        { id: 'btc', title: 'BTC spot', value: 'Loading…', detail: 'Live Coinbase reference' },
      ];

  return (
    <section className="features" id="copy">
      {cards.map((card) => (
        <div key={card.id} className={`feature-card gradient-${card.id}`}>
          <div>
            <p className="muted">{card.title}</p>
            <h3>{card.value}</h3>
            <p className="muted small">{card.detail}</p>
          </div>
          <span className="pill pill-blue">{stats?.updated ?? 'Live'}</span>
        </div>
      ))}
    </section>
  );
}

function TopBar() {
  const { isConnected, address } = useAccount();
  const { connectAsync, connectors } = useConnect({ connector: injected() });
  const { disconnect } = useDisconnect();

  const injectedConnector = connectors.find((c) => c.id === 'injected') ?? connectors[0];

  return (
    <div className="top-bar">
      <div className="logo">DBS Exchange</div>
      <nav className="nav">
        <a href="#exchange">Exchange</a>
        <a href="#futures">Futures</a>
        <a href="#earn">Earn</a>
        <a href="#web3">Web3</a>
      </nav>
      <div className="nav-actions">
        {isConnected ? (
          <>
            <div className="pill">{address}</div>
            <button className="ghost-btn" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="primary-btn"
            disabled={!injectedConnector}
            onClick={() => injectedConnector && connectAsync({ connector: injectedConnector })}
          >
            {injectedConnector ? 'Connect wallet' : 'No wallet found'}
          </button>
        )}
      </div>
    </div>
  );
}

function Hero({ stats }: { stats: GlobalStats | null }) {
  const { isConnected } = useAccount();
  return (
    <section className="hero" id="exchange">
      <div className="hero-left">
        <span className="hero-chip">Decentralized derivatives</span>
        <h1>Trade with live liquidity & Web3 sign-in.</h1>
        <p className="muted">
          Connect your wallet, view real-time books, and route swaps through on-chain liquidity pools with no custodial
          accounts required.
        </p>
        <div className="hero-note">{isConnected ? 'Wallet connected. Ready to trade.' : 'No registration needed—use your wallet.'}</div>
      </div>
      <div className="hero-right">
        <div className="hero-card">
          <div>
            <p className="muted">24H Volume</p>
            <h3>{stats?.volume ?? 'Loading…'}</h3>
            <p className="pill">DEX tracked</p>
          </div>
          <div>
            <p className="muted">Total Liquidity</p>
            <h3>{stats?.liquidity ?? 'Loading…'}</h3>
            <p className="pill pill-blue">Updated {stats?.updated ?? '—'}</p>
          </div>
        </div>
        <div className="hero-markets">
          {featuredPairs.map((pair) => (
            <div key={pair} className="market-chip">
              <div>
                <p className="label">{pair.replace('USDT', '/USDT')}</p>
                <strong>Live</strong>
              </div>
              <span className="text-positive">Book</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Terminal({ orderbook, trades }: { orderbook: LiveOrderBook; trades: TradeRow[] }) {
  const primaryPair = useMemo(() => featuredPairs[0], []);

  return (
    <section className="terminal" id="futures">
      <div className="terminal-header">
        <div>
          <p className="label">Perpetual futures</p>
          <h2>{primaryPair.replace('USDT', '/USDT')}</h2>
          <p className="muted">Cross-margin, real-time order book, and embedded TradingView chart.</p>
        </div>
      </div>

      <div className="terminal-grid">
        <div className="chart-panel">
          <TradingViewChart symbol={`BINANCE:${primaryPair}`} />
        </div>
        <div className="side-panels">
          <OrderBook asks={orderbook.asks} bids={orderbook.bids} mark={orderbook.mark} />
          <Trades trades={trades} />
        </div>
      </div>
    </section>
  );
}

function Earn() {
  return (
    <section className="earn" id="earn">
      <div className="earn-card">
        <div>
          <p className="label">Liquidity pools</p>
          <h3>Provide liquidity & earn fees</h3>
          <p className="muted">Stake USDC, WETH, or WBTC into concentrated liquidity ranges and earn swap fees.</p>
        </div>
        <a href="#web3" className="primary-btn">
          View pools
        </a>
      </div>
      <div className="wallet-card" id="web3">
        <div>
          <p className="label">Wallet</p>
          <h3>Secure Web3 access</h3>
          <p className="muted">Connect a wallet to sign orders, transfer funds, and deploy liquidity.</p>
        </div>
        <div className="wallet-stats">
          <div>
            <p className="muted">Gas price</p>
            <strong>Live from network</strong>
          </div>
          <div>
            <p className="muted">Networks</p>
            <strong>Ethereum &amp; Sepolia</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function AccountActions() {
  const { isConnected } = useAccount();
  if (!isConnected) return null;
  return (
    <div className="account-actions">
      <button className="ghost-btn">Deposit</button>
      <button className="primary-btn">Transfer</button>
      <button className="ghost-btn">Withdraw</button>
    </div>
  );
}

function WalletArea({ priceFeed }: { priceFeed: Record<string, { usd: number; change24h?: number }> }) {
  return (
    <ProtectedPanel title="Wallet trading">
      <div className="wallet-grid">
        <Swap prices={priceFeed} />
        <div className="liquidity-panel">
          <h4>Liquidity provisioning</h4>
          <p className="muted">
            Deploy liquidity into Uniswap v3-style pools and earn proportional swap fees. Choose your price band and fund the
            position straight from your wallet.
          </p>
          <AccountActions />
        </div>
      </div>
    </ProtectedPanel>
  );
}

function DataFetcher({ children }: { children: (data: {
  orderbook: LiveOrderBook;
  trades: TradeRow[];
  stats: GlobalStats | null;
  priceFeed: Record<string, { usd: number; change24h?: number }>;
}) => React.ReactNode }) {
  const [orderbook, setOrderbook] = useState<LiveOrderBook>({ asks: [], bids: [], mark: undefined });
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [priceFeed, setPriceFeed] = useState<Record<string, { usd: number; change24h?: number }>>({});

  useEffect(() => {
    async function loadDepth() {
      try {
        const depth = await fetch('https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=10').then((r) => r.json());
        const book: LiveOrderBook = {
          asks: depth.asks.map((a: string[]) => ({ price: Number(a[0]).toFixed(2), size: Number(a[1]).toFixed(3) })),
          bids: depth.bids.map((b: string[]) => ({ price: Number(b[0]).toFixed(2), size: Number(b[1]).toFixed(3) })),
          mark: depth?.asks?.[0]?.[0] ?? undefined,
        };
        setOrderbook(book);
      } catch (err) {
        setOrderbook({
          asks: [
            { price: '—', size: '—' },
          ],
          bids: [
            { price: '—', size: '—' },
          ],
        });
      }
    }

    async function loadTrades() {
      try {
        const resp = await fetch('https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=15').then((r) => r.json());
        const mapped: TradeRow[] = resp.map((t: any) => ({
          time: new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          price: Number(t.price).toFixed(2),
          size: Number(t.qty).toFixed(4),
          side: t.isBuyerMaker ? 'sell' : 'buy',
        }));
        setTrades(mapped);
      } catch (err) {
        setTrades([]);
      }
    }

    async function loadStats() {
      try {
        const [global, llama, prices] = await Promise.all([
          fetch('https://api.coingecko.com/api/v3/global').then((r) => r.json()),
          fetch('https://api.llama.fi/tvl/uniswap').then((r) => r.json()),
          fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,usd-coin&vs_currencies=usd&include_24hr_change=true',
          ).then((r) => r.json()),
        ]);

        const volume = global.data.total_volume.usd;
        const btcPrice = prices.bitcoin.usd;
        const change = prices.bitcoin.usd_24h_change;
        const liquidity = llama;
        setStats({
          volume: `$${Number(volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          liquidity: `$${Number(liquidity).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          btcPrice: `$${btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${change.toFixed(2)}%)`,
          updated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        setPriceFeed({
          'bitcoin': { usd: prices.bitcoin.usd, change24h: prices.bitcoin.usd_24h_change },
          'ethereum': { usd: prices.ethereum.usd, change24h: prices.ethereum.usd_24h_change },
          'usd-coin': { usd: prices['usd-coin'].usd, change24h: prices['usd-coin'].usd_24h_change },
        });
      } catch (err) {
        setStats(null);
      }
    }

    loadDepth();
    loadTrades();
    loadStats();
    const id = setInterval(() => {
      loadDepth();
      loadTrades();
      loadStats();
    }, 15000);
    return () => clearInterval(id);
  }, []);

  return <>{children({ orderbook, trades, stats, priceFeed })}</>;
}

function AppShell() {
  return (
    <DataFetcher
      children={({ orderbook, trades, stats, priceFeed }) => {
        return (
          <div className="app-root">
            <TopBar />
            <main className="layout">
              <Hero stats={stats} />
              <StatsGrid stats={stats} />
              <Terminal orderbook={orderbook} trades={trades} />
              <Earn />
              <WalletArea priceFeed={priceFeed} />
            </main>
          </div>
        );
      }}
    />
  );
}

export default function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <AppShell />
    </WagmiConfig>
  );
}
