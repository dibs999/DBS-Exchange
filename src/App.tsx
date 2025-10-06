import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config';
import Swap from './Swap';
import './App.css';

const translations = {
  en: {
    brand: 'DBS Exchange',
    nav: ['Markets', 'Trade', 'Derivatives', 'Earn', 'Web3'],
    heroBadge: "Autumn's Lucky Times",
    heroTitle: 'Win from a 100,000 USDC prize pool!',
    heroSubtitle:
      'Complete daily trading quests, climb the leaderboard, and unlock a share of the seasonal prize pool. Rewards refresh every Monday at 00:00 UTC.',
    heroInputPlaceholder: 'Enter email or mobile number',
    heroPrimaryCta: 'Sign up for rewards',
    heroSecondaryCta: 'Explore campaigns',
    heroNote: 'New to DBS Exchange? Join 10M+ traders worldwide and claim welcome rewards worth up to 500 USDC.',
    promoIdeal: 'IDEX Launch: Trade $IDEX and get 5 USDC instantly! Rewards are limited, so be quick.',
    promoDca: 'DCA & Spot Grid bots are now live! Automate your trading strategies in just a few taps.',
    marketTitle: 'Catch Your Next Trading Opportunity',
    marketOverview: 'Market Overview',
    tableTabs: ['Hot Coins', 'Top Volume', 'New Listings'],
    tableHeaders: {
      name: 'Name',
      price: 'Last Price',
      change: 'Change',
      cap: 'Market Cap',
    },
    timeframes: {
      '24h': '24h',
      '7d': '7d',
    },
    gainersTitle: 'Top Gainers',
    losersTitle: 'Top Gainers',
    toolsTitle: 'Tools & Insights',
    loadingMarkets: 'Loading live market data…',
    errorMarkets: 'Unable to load live data right now. Showing sample prices.',
    retry: 'Retry',
    noResults: 'No results available.',
    viewAllMarkets: 'View all markets',
    openOnTradingView: 'Open on TradingView',
  },
  de: {
    brand: 'DBS Börse',
    nav: ['Märkte', 'Handel', 'Derivate', 'Verdienen', 'Web3'],
    heroBadge: 'Goldener Herbst',
    heroTitle: 'Gewinne aus einem Preispool von 100.000 USDC!',
    heroSubtitle:
      'Erledige tägliche Handelsmissionen, klettere in der Rangliste nach oben und sichere dir deinen Anteil am saisonalen Preispool. Belohnungen werden jeden Montag um 00:00 UTC erneuert.',
    heroInputPlaceholder: 'E-Mail oder Mobilnummer eingeben',
    heroPrimaryCta: 'Für Belohnungen registrieren',
    heroSecondaryCta: 'Kampagnen entdecken',
    heroNote: 'Neu bei DBS Exchange? Schließe dich über 10 Millionen Tradern weltweit an und erhalte Willkommensgeschenke im Wert von bis zu 500 USDC.',
    promoIdeal: 'IDEX Start: Handle $IDEX und erhalte sofort 5 USDC! Die Belohnungen sind begrenzt.',
    promoDca: 'DCA- & Spot-Grid-Bots sind live! Automatisiere deine Strategie mit wenigen Klicks.',
    marketTitle: 'Finde deine nächste Handelschance',
    marketOverview: 'Marktüberblick',
    tableTabs: ['Trend-Coins', 'Top Volumen', 'Neue Listings'],
    tableHeaders: {
      name: 'Name',
      price: 'Letzter Preis',
      change: 'Veränderung',
      cap: 'Marktkapitalisierung',
    },
    timeframes: {
      '24h': '24 Std.',
      '7d': '7 Tage',
    },
    gainersTitle: 'Top Gewinner',
    losersTitle: 'Top Gewinner',
    toolsTitle: 'Tools & Insights',
    loadingMarkets: 'Live-Marktdaten werden geladen…',
    errorMarkets: 'Live-Daten konnten nicht geladen werden. Beispielwerte werden angezeigt.',
    retry: 'Erneut versuchen',
    noResults: 'Keine Ergebnisse verfügbar.',
    viewAllMarkets: 'Alle Märkte ansehen',
    openOnTradingView: 'Auf TradingView öffnen',
  }
};

type TimeframeKey = '24h' | '7d';
type MarketTabKey = 'hot' | 'volume' | 'new';

type MarketDisplayRow = {
  id: string;
  name: string;
  symbol: string;
  price: number | null;
  change24h: number;
  change7d: number;
  marketCap: number | null;
};

type GainerDisplayRow = {
  id: string;
  name: string;
  symbol: string;
  change24h: number;
  change7d: number;
};

type TradingViewRow = {
  symbol: string;
  name: string;
  price: number | null;
  change24h: number;
  change7d: number;
  marketCap: number | null;
  volume: number | null;
};

const FALLBACK_MARKETS: MarketDisplayRow[] = [
  {
    id: 'BINANCE:BTCUSDT',
    name: 'Bitcoin / TetherUS',
    symbol: 'BINANCE:BTCUSDT',
    price: 26120.5,
    change24h: 2.45,
    change7d: 5.38,
    marketCap: 507_800_000_000,
  },
  {
    id: 'BINANCE:ETHUSDT',
    name: 'Ethereum / TetherUS',
    symbol: 'BINANCE:ETHUSDT',
    price: 1647.2,
    change24h: 1.82,
    change7d: 3.04,
    marketCap: 198_400_000_000,
  },
  {
    id: 'BINANCE:XRPUSDT',
    name: 'XRP / TetherUS',
    symbol: 'BINANCE:XRPUSDT',
    price: 0.5112,
    change24h: -0.74,
    change7d: 1.12,
    marketCap: 27_100_000_000,
  },
  {
    id: 'BINANCE:SOLUSDT',
    name: 'Solana / TetherUS',
    symbol: 'BINANCE:SOLUSDT',
    price: 21.87,
    change24h: 3.92,
    change7d: 6.45,
    marketCap: 8_700_000_000,
  },
  {
    id: 'BINANCE:ARBUSDT',
    name: 'Arbitrum / TetherUS',
    symbol: 'BINANCE:ARBUSDT',
    price: 1.09,
    change24h: 5.13,
    change7d: 8.26,
    marketCap: 1_400_000_000,
  },
];

const FALLBACK_GAINERS: GainerDisplayRow[] = [
  { id: 'BINANCE:ROSEUSDT', name: 'ROSE', symbol: 'BINANCE:ROSEUSDT', change24h: 11.3, change7d: 18.2 },
  { id: 'BINANCE:SUIUSDT', name: 'SUI', symbol: 'BINANCE:SUIUSDT', change24h: 9.7, change7d: 14.1 },
  { id: 'BINANCE:OPUSDT', name: 'OP', symbol: 'BINANCE:OPUSDT', change24h: 7.8, change7d: 12.4 },
  { id: 'BINANCE:INJUSDT', name: 'INJ', symbol: 'BINANCE:INJUSDT', change24h: 6.2, change7d: 10.7 },
  { id: 'BINANCE:STXUSDT', name: 'STX', symbol: 'BINANCE:STXUSDT', change24h: 5.6, change7d: 7.9 },
];

const TRADING_VIEW_ENDPOINT = 'https://scanner.tradingview.com/crypto/scan';
const TRADING_VIEW_COLUMNS = [
  'name',
  'close',
  'change',
  'change_abs',
  'change_1w',
  'market_cap_basic',
  'volume',
  'description',
  'pro_name',
] as const;

const MARKET_ROW_COUNT = 6;
const GAINER_COUNT = 5;
const TIMEFRAMES: TimeframeKey[] = ['24h', '7d'];

async function queryTradingView(
  options: {
    sortBy: string;
    sortOrder?: 'asc' | 'desc';
    range?: [number, number];
    filters?: Array<Record<string, unknown>>;
  },
  signal?: AbortSignal
): Promise<TradingViewRow[]> {
  const payload = {
    filter: [
      { left: 'type', operation: 'equal', right: 'crypto' },
      ...(options.filters ?? []),
    ],
    options: { lang: 'en' },
    symbols: { query: { types: [] as string[] }, tickers: [] as string[] },
    columns: TRADING_VIEW_COLUMNS,
    sort: { sortBy: options.sortBy, sortOrder: options.sortOrder ?? 'desc' },
    range: options.range ?? [0, 49],
  };

  const response = await fetch(TRADING_VIEW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`TradingView request failed (${response.status})`);
  }

  const data = (await response.json()) as { data?: Array<{ s: string; d: (number | string | null)[] }> };

  if (!data.data) {
    throw new Error('TradingView response missing data');
  }

  return data.data.map((item) => {
    const [name, close, changeDay, , changeWeek, marketCap, volume, description, proName] = item.d;
    return {
      symbol: item.s,
      name: (typeof description === 'string' && description) || (typeof proName === 'string' && proName) || (typeof name === 'string' ? name : item.s),
      price: typeof close === 'number' ? close : null,
      change24h: typeof changeDay === 'number' ? changeDay : 0,
      change7d: typeof changeWeek === 'number' ? changeWeek : typeof changeDay === 'number' ? changeDay : 0,
      marketCap: typeof marketCap === 'number' ? marketCap : null,
      volume: typeof volume === 'number' ? volume : null,
    };
  });
}

function formatPrice(value: number | null, locale: string) {
  if (value === null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1000 ? 0 : abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatMarketCap(value: number | null, locale: string) {
  if (value === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChange(value: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatted = formatter.format(Math.abs(value));
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${formatted}%`;
}

function openTradingView(symbol: string) {
  if (!symbol || typeof window === 'undefined') return;
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
  window.open(url, '_blank', 'noopener');
}

export function AppBody() {
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const t = translations[language];
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  const timeframeLabel = language === 'de' ? 'Zeitraum' : 'Timeframe';

  const tableTabs = useMemo(
    () => [
      { key: 'hot' as MarketTabKey, label: t.tableTabs[0] },
      { key: 'volume' as MarketTabKey, label: t.tableTabs[1] },
      { key: 'new' as MarketTabKey, label: t.tableTabs[2] },
    ],
    [t.tableTabs]
  );

  const [activeTab, setActiveTab] = useState<MarketTabKey>('hot');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('24h');
  const [marketRows, setMarketRows] = useState<MarketDisplayRow[]>(FALLBACK_MARKETS);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [gainerRows, setGainerRows] = useState<GainerDisplayRow[]>(FALLBACK_GAINERS);
  const [gainerLoading, setGainerLoading] = useState(false);
  const [gainerError, setGainerError] = useState<string | null>(null);

  const changeHeaderLabel = useMemo(
    () => `${t.timeframes[timeframe]} ${t.tableHeaders.change}`,
    [t.tableHeaders.change, t.timeframes, timeframe]
  );

  const fetchMarketData = useCallback(
    async (signal?: AbortSignal) => {
      setMarketLoading(true);
      setMarketError(null);

      try {
        let sortBy = timeframe === '24h' ? 'change' : 'change_1w';
        let sortOrder: 'asc' | 'desc' = 'desc';
        let range: [number, number] | undefined;

        if (activeTab === 'volume') {
          sortBy = 'volume';
          sortOrder = 'desc';
        }

        if (activeTab === 'new') {
          sortBy = 'market_cap_basic';
          sortOrder = 'asc';
          range = [0, 49];
        }

        const rows = await queryTradingView({ sortBy, sortOrder, range }, signal);

        if (signal?.aborted) {
          return;
        }

        let processed = rows;

        if (activeTab === 'new') {
          processed = rows
            .filter((row) => typeof row.marketCap === 'number' && (row.marketCap ?? 0) > 0)
            .sort((a, b) => {
              const changeA = timeframe === '24h' ? a.change24h : a.change7d;
              const changeB = timeframe === '24h' ? b.change24h : b.change7d;
              return changeB - changeA;
            });
        }

        setMarketRows(
          processed.slice(0, MARKET_ROW_COUNT).map((row) => ({
            id: row.symbol,
            name: row.name,
            symbol: row.symbol,
            price: row.price,
            change24h: row.change24h,
            change7d: row.change7d,
            marketCap: row.marketCap,
          }))
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        setMarketError(err?.message ?? 'Failed to load markets');
        setMarketRows(FALLBACK_MARKETS);
      } finally {
        if (signal?.aborted) {
          return;
        }
        setMarketLoading(false);
      }
    },
    [activeTab, timeframe]
  );

  const fetchGainers = useCallback(
    async (signal?: AbortSignal) => {
      setGainerLoading(true);
      setGainerError(null);

      try {
        const rows = await queryTradingView(
          {
            sortBy: timeframe === '24h' ? 'change' : 'change_1w',
            sortOrder: 'desc',
            range: [0, 29],
          },
          signal
        );

        if (signal?.aborted) {
          return;
        }

        setGainerRows(
          rows.slice(0, GAINER_COUNT).map((row) => ({
            id: row.symbol,
            name: row.name,
            symbol: row.symbol,
            change24h: row.change24h,
            change7d: row.change7d,
          }))
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        setGainerError(err?.message ?? 'Failed to load gainers');
        setGainerRows(FALLBACK_GAINERS);
      } finally {
        if (signal?.aborted) {
          return;
        }
        setGainerLoading(false);
      }
    },
    [timeframe]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMarketData(controller.signal);
    return () => controller.abort();
  }, [fetchMarketData]);

  useEffect(() => {
    const controller = new AbortController();
    fetchGainers(controller.signal);
    return () => controller.abort();
  }, [fetchGainers]);

  const handleRowKeyDown = useCallback((event: React.KeyboardEvent<HTMLTableRowElement>, symbol: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTradingView(symbol);
    }
  }, []);

  const handleViewAllMarkets = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.open('https://www.tradingview.com/markets/cryptocurrencies/prices-all/', '_blank', 'noopener');
  }, []);

  const changeFormatter = useCallback((value: number) => formatChange(value, locale), [locale]);
  const priceFormatter = useCallback((value: number | null) => formatPrice(value, locale), [locale]);
  const marketCapFormatter = useCallback((value: number | null) => formatMarketCap(value, locale), [locale]);

  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="top-nav">
          <div className="nav-left">
            <div className="brand">{t.brand}</div>
            <nav className="nav-links">
              {t.nav.map((item) => (
                <a key={item} className="nav-link" href="#">
                  {item}
                </a>
              ))}
            </nav>
          </div>
          <div className="nav-right">
            <button className="ghost-btn">Log in</button>
            <button className="primary-btn">Sign up</button>
            <select
              className="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
        </header>

        <main>
          <section className="hero">
            <div className="hero-content">
              <div className="hero-badge">{t.heroBadge}</div>
              <h1 className="hero-title">{t.heroTitle}</h1>
              <p className="hero-subtitle">{t.heroSubtitle}</p>
              <div className="hero-form">
                <input
                  type="text"
                  placeholder={t.heroInputPlaceholder}
                  className="hero-input"
                />
                <button className="hero-cta">{t.heroPrimaryCta}</button>
              </div>
              <div className="hero-actions">
                <button className="secondary-btn">{t.heroSecondaryCta}</button>
              </div>
              <p className="hero-note">{t.heroNote}</p>
            </div>
            <div className="hero-visual">
              <div className="hero-gradient" />
              <div className="hero-card hero-card--primary">
                <div className="hero-card-title">Galaxy Tab S9</div>
                <div className="hero-card-subtitle">Ultra trading companion</div>
                <div className="hero-card-chip">Exclusive drop</div>
              </div>
              <div className="hero-card hero-card--secondary">
                <div className="hero-card-title">JBL Charge 5</div>
                <div className="hero-card-subtitle">Win premium gear</div>
              </div>
              <div className="hero-floating">100,000 USDC</div>
            </div>
          </section>

          <section className="promo-row">
            <article className="promo-card">
              <div className="promo-indicator" />
              <div>
                <h3>IDEX Launch Bonus</h3>
                <p>{t.promoIdeal}</p>
              </div>
              <span className="promo-link">→</span>
            </article>
            <article className="promo-card">
              <div className="promo-indicator promo-indicator--orange" />
              <div>
                <h3>Automation Bots</h3>
                <p>{t.promoDca}</p>
              </div>
              <span className="promo-link">→</span>
            </article>
          </section>

          <section className="market-section">
            <div className="market-header">
              <div>
                <h2>{t.marketTitle}</h2>
                <p>{t.marketOverview}</p>
              </div>
              <button className="ghost-btn" type="button" onClick={handleViewAllMarkets}>
                {t.viewAllMarkets}
              </button>
            </div>
            <div className="market-layout">
              <div className="market-card">
                <div className="market-controls">
                  <div className="tab-row">
                    {tableTabs.map((tab) => (
                      <button
                        key={tab.key}
                        className={`tab-btn ${activeTab === tab.key ? 'tab-btn--active' : ''}`}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="timeframe-toggle" role="group" aria-label={timeframeLabel}>
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        className={`timeframe-btn ${timeframe === tf ? 'timeframe-btn--active' : ''}`}
                        onClick={() => setTimeframe(tf)}
                        aria-pressed={timeframe === tf}
                      >
                        {t.timeframes[tf]}
                      </button>
                    ))}
                  </div>
                </div>
                {marketError && (
                  <div className="market-status market-status--error" role="status">
                    <span>{t.errorMarkets}</span>
                    <button type="button" className="link-btn" onClick={() => fetchMarketData()}>
                      {t.retry}
                    </button>
                  </div>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>{t.tableHeaders.name}</th>
                      <th>{t.tableHeaders.price}</th>
                      <th>{changeHeaderLabel}</th>
                      <th>{t.tableHeaders.cap}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketLoading && (
                      <tr>
                        <td colSpan={4} className="table-status">
                          {t.loadingMarkets}
                        </td>
                      </tr>
                    )}
                    {!marketLoading && marketRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="table-status">
                          {t.noResults}
                        </td>
                      </tr>
                    )}
                    {!marketLoading &&
                      marketRows.map((row) => {
                        const changeValue = timeframe === '24h' ? row.change24h : row.change7d;
                        return (
                          <tr
                            key={row.id}
                            className="market-row"
                            role="link"
                            tabIndex={0}
                            onClick={() => openTradingView(row.symbol)}
                            onKeyDown={(event) => handleRowKeyDown(event, row.symbol)}
                            aria-label={`${row.name} ${t.openOnTradingView}`}
                          >
                            <td>
                              <div className="market-name">
                                <span>{row.name}</span>
                                <span className="market-symbol">{row.symbol}</span>
                              </div>
                            </td>
                            <td>{priceFormatter(row.price)}</td>
                            <td className={changeValue >= 0 ? 'text-positive' : 'text-negative'}>{changeFormatter(changeValue)}</td>
                            <td>{row.marketCap !== null ? `$${marketCapFormatter(row.marketCap)}` : '—'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <aside className="market-aside">
                <div className="aside-card">
                  <header className="aside-header">
                    <h3>{t.gainersTitle}</h3>
                    <div className="timeframe-toggle" role="group" aria-label={timeframeLabel}>
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          className={`timeframe-btn timeframe-btn--compact ${timeframe === tf ? 'timeframe-btn--active' : ''}`}
                          onClick={() => setTimeframe(tf)}
                          aria-pressed={timeframe === tf}
                        >
                          {t.timeframes[tf]}
                        </button>
                      ))}
                    </div>
                  </header>
                  <ul className="gainers-list">
                    {gainerLoading && <li className="gainer-status">{t.loadingMarkets}</li>}
                    {!gainerLoading &&
                      gainerRows.map((item) => {
                        const changeValue = timeframe === '24h' ? item.change24h : item.change7d;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="gainer-row"
                              onClick={() => openTradingView(item.symbol)}
                              aria-label={`${item.name} ${t.openOnTradingView}`}
                            >
                              <span className="gainer-name">{item.name}</span>
                              <span className={changeValue >= 0 ? 'text-positive' : 'text-negative'}>
                                {changeFormatter(changeValue)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                  {gainerError && <p className="aside-hint">{t.errorMarkets}</p>}
                </div>
                <div className="aside-card">
                  <header className="aside-header">
                    <h3>{t.toolsTitle}</h3>
                  </header>
                  <p className="tools-copy">
                    Optimise entries with depth charts, mark price alerts and social sentiment. Tap into pro-grade
                    analytics built directly into DBS Exchange.
                  </p>
                  <Swap />
                </div>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <AppBody />
    </WagmiConfig>
  );
}
