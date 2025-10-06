import React, { useMemo, useState } from 'react';
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
    tableHeaders: ['Name', 'Last Price', '24h Change', 'Market Cap'],
    gainersTitle: 'Top Gainers',
    losersTitle: 'Top Gainers',
    toolsTitle: 'Tools & Insights'
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
    tableHeaders: ['Name', 'Letzter Preis', '24h Veränderung', 'Marktkapitalisierung'],
    gainersTitle: 'Top Gewinner',
    losersTitle: 'Top Gewinner',
    toolsTitle: 'Tools & Insights'
  }
};

const hotCoins = [
  { name: 'BTC/USDT', price: '26,120.50', change: 2.45, cap: '$507.8B' },
  { name: 'ETH/USDT', price: '1,647.20', change: 1.82, cap: '$198.4B' },
  { name: 'XRP/USDT', price: '0.5112', change: -0.74, cap: '$27.1B' },
  { name: 'SOL/USDT', price: '21.87', change: 3.92, cap: '$8.7B' },
  { name: 'ARB/USDT', price: '1.09', change: 5.13, cap: '$1.4B' }
];

const gainers = [
  { name: 'ROSE', change: 11.3 },
  { name: 'SUI', change: 9.7 },
  { name: 'OP', change: 7.8 },
  { name: 'INJ', change: 6.2 },
  { name: 'STX', change: 5.6 }
];

export function AppBody() {
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const t = translations[language];

  const tableTabs = useMemo(() => t.tableTabs, [t]);

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
              <button className="ghost-btn">View all markets</button>
            </div>
            <div className="market-layout">
              <div className="market-card">
                <div className="tab-row">
                  {tableTabs.map((tab, index) => (
                    <button
                      key={tab}
                      className={`tab-btn ${index === 0 ? 'tab-btn--active' : ''}`}
                      type="button"
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <table>
                  <thead>
                    <tr>
                      {t.tableHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hotCoins.map((coin) => (
                      <tr key={coin.name}>
                        <td>{coin.name}</td>
                        <td>{coin.price}</td>
                        <td className={coin.change >= 0 ? 'text-positive' : 'text-negative'}>
                          {coin.change >= 0 ? '+' : ''}
                          {coin.change.toFixed(2)}%
                        </td>
                        <td>{coin.cap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="market-aside">
                <div className="aside-card">
                  <header className="aside-header">
                    <h3>{t.gainersTitle}</h3>
                    <button className="ghost-btn">24h</button>
                  </header>
                  <ul className="gainers-list">
                    {gainers.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <span className="text-positive">+{item.change.toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
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
