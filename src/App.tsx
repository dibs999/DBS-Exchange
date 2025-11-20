import React, { useEffect, useMemo, useState } from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config';
import Swap, { PriceFeed } from './Swap';

const translations = {
  en: {
    title: 'DEX Exchange Prototype',
    welcome: 'Welcome to the decentralised exchange!'
  },
  de: {
    title: 'DEX Börse Prototyp',
    welcome: 'Willkommen bei der dezentralen Börse!'
  }
};

type GasOracle = { fast: number; standard: number; slow: number; source: string };
type MarketRow = { name: string; symbol: string; price: number; change: number; volume: number };

type ApiState<T> = { data: T; updated: string; notice?: string };

const FALLBACK_PRICES: PriceFeed = {
  'ethereum': { usd: 3200, change24h: 1.2 },
  'usd-coin': { usd: 1, change24h: 0 },
  'wrapped-bitcoin': { usd: 62000, change24h: 0.8 },
};

const FALLBACK_TOKENS: MarketRow[] = [
  { name: 'Ethereum', symbol: 'ETH', price: 3200, change: 1.2, volume: 12000000000 },
  { name: 'USD Coin', symbol: 'USDC', price: 1, change: 0, volume: 9000000000 },
  { name: 'Wrapped Bitcoin', symbol: 'WBTC', price: 62000, change: 0.8, volume: 4000000000 },
  { name: 'Uniswap', symbol: 'UNI', price: 6.1, change: 4.5, volume: 380000000 },
  { name: 'Chainlink', symbol: 'LINK', price: 18.3, change: 3.1, volume: 470000000 },
];

const FALLBACK_GAS: GasOracle = { fast: 24, standard: 19, slow: 12, source: 'offline snapshot' };

function formatNumber(value: number) {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1000) return value.toLocaleString();
  return value.toFixed(2);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-header">
        <h2>{title}</h2>
        <div className="line" />
      </div>
      {children}
    </section>
  );
}

function PriceBoard({ prices }: { prices: PriceFeed }) {
  const cards = [
    { key: 'ethereum', label: 'Ether', accent: '#61dafb' },
    { key: 'usd-coin', label: 'USDC', accent: '#6ee7b7' },
    { key: 'wrapped-bitcoin', label: 'WBTC', accent: '#fbbf24' },
  ];
  return (
    <div className="grid three">
      {cards.map((c) => {
        const item = prices[c.key];
        if (!item) return null;
        const change = item.change24h ?? 0;
        const up = change >= 0;
        return (
          <div key={c.key} className="card" style={{ borderColor: c.accent }}>
            <p className="label">{c.label}</p>
            <p className="value">${item.usd.toLocaleString()}</p>
            <p className={up ? 'pill up' : 'pill down'}>{up ? '+' : ''}{change?.toFixed(2)}% 24h</p>
          </div>
        );
      })}
    </div>
  );
}

function MarketTable({ rows }: { rows: MarketRow[] }) {
  return (
    <div className="table">
      <div className="table-head">
        <span>Asset</span>
        <span>Price</span>
        <span>24h</span>
        <span>Volume</span>
      </div>
      {rows.map((row) => (
        <div key={row.symbol} className="table-row">
          <span>{row.name} <span className="muted">({row.symbol})</span></span>
          <span>${row.price.toLocaleString()}</span>
          <span className={row.change >= 0 ? 'up' : 'down'}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</span>
          <span>${formatNumber(row.volume)}</span>
        </div>
      ))}
    </div>
  );
}

function GasPanel({ gas }: { gas: GasOracle }) {
  return (
    <div className="card gas">
      <div className="gas-line">
        <span className="label">Fast</span>
        <span className="value">{gas.fast} gwei</span>
      </div>
      <div className="gas-line">
        <span className="label">Standard</span>
        <span className="value">{gas.standard} gwei</span>
      </div>
      <div className="gas-line">
        <span className="label">Eco</span>
        <span className="value">{gas.slow} gwei</span>
      </div>
      <p className="muted">Source: {gas.source}</p>
    </div>
  );
}

function LiveStatus({ updated, notice }: ApiState<unknown>) {
  return (
    <div className="muted text-sm">
      <span>Aktualisiert: {updated}</span>
      {notice && <span className="pill down" style={{ marginLeft: 8 }}>{notice}</span>}
    </div>
  );
}

function AppContent() {
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const t = translations[language];

  const [prices, setPrices] = useState<ApiState<PriceFeed>>({ data: FALLBACK_PRICES, updated: 'Fallback' });
  const [markets, setMarkets] = useState<ApiState<MarketRow[]>>({ data: FALLBACK_TOKENS, updated: 'Fallback' });
  const [gas, setGas] = useState<ApiState<GasOracle>>({ data: FALLBACK_GAS, updated: 'Fallback' });

  useEffect(() => {
    async function loadPrices() {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum,usd-coin,wrapped-bitcoin&price_change_percentage=24h');
        const json = await res.json();
        const map: PriceFeed = {};
        json.forEach((row: any) => {
          map[row.id] = { usd: row.current_price, change24h: row.price_change_percentage_24h };
        });
        setPrices({ data: map, updated: new Date().toLocaleTimeString() });
      } catch (err: any) {
        setPrices({ data: FALLBACK_PRICES, updated: new Date().toLocaleTimeString(), notice: err?.message || 'offline mode' });
      }
    }
    loadPrices();
  }, []);

  useEffect(() => {
    async function loadMarkets() {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h');
        const json = await res.json();
        const rows: MarketRow[] = json.map((row: any) => ({
          name: row.name,
          symbol: row.symbol.toUpperCase(),
          price: row.current_price,
          change: row.price_change_percentage_24h,
          volume: row.total_volume,
        }));
        setMarkets({ data: rows, updated: new Date().toLocaleTimeString() });
      } catch (err: any) {
        setMarkets({ data: FALLBACK_TOKENS, updated: new Date().toLocaleTimeString(), notice: err?.message || 'offline mode' });
      }
    }
    loadMarkets();
  }, []);

  useEffect(() => {
    async function loadGas() {
      try {
        const res = await fetch('https://etherchain.org/api/gasPriceOracle');
        const json = await res.json();
        const info: GasOracle = {
          fast: Math.round(json.fast),
          standard: Math.round(json.standard),
          slow: Math.round(json.safeLow),
          source: 'etherchain.org',
        };
        setGas({ data: info, updated: new Date().toLocaleTimeString() });
      } catch (err: any) {
        setGas({ data: FALLBACK_GAS, updated: new Date().toLocaleTimeString(), notice: err?.message || 'offline mode' });
      }
    }
    loadGas();
  }, []);

  const heroStats = useMemo(() => ([
    { label: 'Aktive Netzwerke', value: 'Mainnet & Sepolia' },
    { label: 'Live Quote Quelle', value: 'Uniswap v3 Quoter' },
    { label: 'Fallback', value: 'CoinGecko + Etherchain' },
  ]), []);

  return (
    <div className="page">
      <style>
        {`
          :root { color-scheme: dark; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
          body { margin: 0; background: #050505; color: #f5f5f5; }
          .page { min-height: 100vh; background: radial-gradient(90% 60% at 10% 10%, rgba(99,102,241,0.08), transparent),
                   radial-gradient(60% 40% at 90% 0%, rgba(236,72,153,0.1), transparent),
                   linear-gradient(180deg, #06060a 0%, #020205 100%); }
          header { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid #111; }
          header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
          header nav { display: flex; gap: 16px; color: #9ca3af; }
          header nav span { cursor: pointer; }
          header nav span:hover { color: #e5e7eb; }
          select { background: #111827; color: #e5e7eb; border: 1px solid #1f2937; padding: 6px 8px; border-radius: 8px; }
          .hero { padding: 32px; display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
          .hero-card { padding: 24px; border: 1px solid #1f2937; border-radius: 16px; background: rgba(255,255,255,0.02); box-shadow: 0 10px 50px rgba(0,0,0,0.45); }
          .hero-card h2 { margin: 0 0 8px 0; font-size: 28px; }
          .hero-card p { margin: 0 0 16px 0; color: #d1d5db; }
          .hero-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 16px; }
          .pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; font-size: 12px; }
          .pill.up { background: rgba(16,185,129,0.15); color: #34d399; }
          .pill.down { background: rgba(239,68,68,0.12); color: #f87171; }
          .btn { border: 1px solid transparent; background: #111827; color: #f9fafb; padding: 10px 14px; border-radius: 12px; cursor: pointer; }
          .btn:hover { border-color: #6366f1; }
          .btn.primary { background: linear-gradient(90deg, #6366f1, #8b5cf6); }
          .btn.secondary { background: #0ea5e9; }
          .btn.ghost { background: transparent; border-color: #1f2937; }
          .section { padding: 16px 32px 32px 32px; }
          .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
          .section h2 { margin: 0; }
          .line { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(99,102,241,0.2), transparent); }
          .grid.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
          .grid.three { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
          .card { border: 1px solid #1f2937; border-radius: 14px; padding: 16px; background: rgba(255,255,255,0.03); }
          .label { color: #9ca3af; font-size: 12px; }
          .value { font-weight: 700; font-size: 20px; }
          .table { border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; }
          .table-head, .table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding: 12px 16px; }
          .table-head { background: rgba(255,255,255,0.03); color: #9ca3af; font-size: 12px; }
          .table-row { border-top: 1px solid #111827; align-items: center; }
          .table-row .muted { color: #9ca3af; }
          .muted { color: #9ca3af; }
          .text-sm { font-size: 12px; }
          .gas { display: flex; flex-direction: column; gap: 8px; }
          .gas-line { display: flex; align-items: center; justify-content: space-between; }
          .swap-card { border: 1px solid #1f2937; border-radius: 16px; padding: 16px; background: rgba(12,15,30,0.7); box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
          .swap-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
          .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
          input { background: #0b1224; border: 1px solid #111827; color: #f9fafb; border-radius: 12px; padding: 12px; width: 100%; }
          .input-row { display: flex; flex-direction: column; gap: 8px; }
          .preset-row { display: flex; gap: 8px; flex-wrap: wrap; }
          .chip { background: #111827; color: #e5e7eb; border: 1px solid #1f2937; border-radius: 12px; padding: 6px 10px; cursor: pointer; }
          .chip:hover { border-color: #6366f1; }
          .hint { color: #9ca3af; font-size: 12px; }
          .actions { display: flex; gap: 8px; flex-wrap: wrap; }
          .quote { border: 1px dashed #1f2937; padding: 12px; border-radius: 12px; background: rgba(99,102,241,0.08); }
          .status { margin-top: 8px; color: #fca5a5; font-size: 13px; }
          footer { padding: 24px 32px; border-top: 1px solid #111; color: #9ca3af; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
          @media (max-width: 900px) { .hero { grid-template-columns: 1fr; } }
        `}
      </style>

      <header>
        <div>
          <h1>{t.title}</h1>
          <p className="muted">Multi-chain swap with on-chain routing and public data fallbacks.</p>
        </div>
        <nav>
          <span>Swap</span>
          <span>Liquidity</span>
          <span>Markets</span>
        </nav>
        <select value={language} onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </header>

      <div className="hero">
        <div className="hero-card">
          <h2>{t.welcome}</h2>
          <p>Live Kurse von CoinGecko plus direkte Uniswap v3 Ausführung über wagmi/viem. Fällt das RPC aus, bleiben Quotes dank öffentlicher APIs nutzbar.</p>
          <div className="hero-grid">
            {heroStats.map((s) => (
              <div key={s.label} className="card">
                <p className="label">{s.label}</p>
                <p className="value">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-card">
          <PriceBoard prices={prices.data} />
          <LiveStatus {...prices} />
        </div>
      </div>

      <Section title="Swap">
        <div className="grid two">
          <Swap prices={prices.data} />
          <GasPanel gas={gas.data} />
        </div>
        <LiveStatus {...gas} />
      </Section>

      <Section title="Market Pulse">
        <MarketTable rows={markets.data} />
        <LiveStatus {...markets} />
      </Section>

      <footer>
        <span>Open data: CoinGecko, Etherchain gas oracle.</span>
        <span>On-chain: Uniswap v3 (Quoter v2 & SwapRouter02).</span>
      </footer>
    </div>
  );
}

export function AppBody() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <AppContent />
    </WagmiConfig>
  );
}

export default function App() {
  return <AppBody />;
}

