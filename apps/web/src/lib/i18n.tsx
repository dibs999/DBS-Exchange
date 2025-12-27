import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'de' | 'en';

type Translations = {
  [key: string]: {
    de: string;
    en: string;
  };
};

const translations: Translations = {
  // Common
  'common.connect': { de: 'Wallet verbinden', en: 'Connect Wallet' },
  'common.disconnect': { de: 'Trennen', en: 'Disconnect' },
  'common.deposit': { de: 'Einzahlen', en: 'Deposit' },
  'common.withdraw': { de: 'Abheben', en: 'Withdraw' },
  'common.cancel': { de: 'Abbrechen', en: 'Cancel' },
  'common.confirm': { de: 'Bestätigen', en: 'Confirm' },
  'common.close': { de: 'Schließen', en: 'Close' },
  'common.save': { de: 'Speichern', en: 'Save' },
  'common.loading': { de: 'Lädt...', en: 'Loading...' },
  
  // Navigation
  'nav.terminal': { de: 'Terminal', en: 'Terminal' },
  'nav.markets': { de: 'Märkte', en: 'Markets' },
  'nav.liquidity': { de: 'Liquidität', en: 'Liquidity' },
  'nav.risk': { de: 'Risiko', en: 'Risk' },
  'nav.docs': { de: 'Dokumentation', en: 'Docs' },
  
  // Account
  'account.title': { de: 'Kontoübersicht', en: 'Account Overview' },
  'account.walletBalance': { de: 'Wallet-Guthaben', en: 'Wallet Balance' },
  'account.engineBalance': { de: 'Engine (Frei)', en: 'Engine (Free)' },
  'account.marginLocked': { de: 'Gesperrte Margin', en: 'Margin Locked' },
  'account.unrealizedPnl': { de: 'Unrealisierter P&L', en: 'Unrealized P&L' },
  'account.available': { de: 'Verfügbar (Frei)', en: 'Available (Free)' },
  'account.utilization': { de: 'Auslastung', en: 'Utilization' },
  'account.health.healthy': { de: 'Gesund', en: 'Healthy' },
  'account.health.moderate': { de: 'Moderat', en: 'Moderate' },
  'account.health.atRisk': { de: 'Gefährdet', en: 'At Risk' },
  
  // Orders
  'order.title': { de: 'Order-Ticket', en: 'Order Ticket' },
  'order.place': { de: 'Trade platzieren', en: 'Place a trade' },
  'order.size': { de: 'Größe (ETH)', en: 'Size (ETH)' },
  'order.leverage': { de: 'Hebel', en: 'Leverage' },
  'order.triggerPrice': { de: 'Trigger-Preis', en: 'Trigger price' },
  'order.side.long': { de: 'Long', en: 'Long' },
  'order.side.short': { de: 'Short', en: 'Short' },
  'order.reduceOnly': { de: 'Nur reduzieren', en: 'Reduce only' },
  'order.type.market': { de: 'Market', en: 'Market' },
  'order.type.limit': { de: 'Limit', en: 'Limit' },
  'order.type.stop': { de: 'Stop', en: 'Stop' },
  'order.preview.notional': { de: 'Gesch. Notional', en: 'Est. Notional' },
  'order.preview.margin': { de: 'Gesch. Margin', en: 'Est. Margin' },
  'order.preview.liqPrice': { de: 'Gesch. Liq. Preis', en: 'Est. Liq. Price' },
  'order.preview.priceImpact': { de: 'Preis-Impact', en: 'Price Impact' },
  'order.warning.highImpact': { de: '⚠️ Hoher Preis-Impact. Erwäge, die Order-Größe zu reduzieren.', en: '⚠️ High price impact. Consider reducing order size.' },
  
  // Positions
  'positions.title': { de: 'Offene Positionen', en: 'Open Positions' },
  'positions.close': { de: 'Position schließen', en: 'Close Position' },
  'positions.leverage': { de: 'Hebel', en: 'Leverage' },
  'positions.margin': { de: 'Margin', en: 'Margin' },
  'positions.liquidationPrice': { de: 'Liquidationspreis', en: 'Liquidation Price' },
  'positions.notional': { de: 'Notional', en: 'Notional' },
  'positions.roe': { de: 'ROE', en: 'ROE' },
  
  // Modals
  'modal.deposit.title': { de: 'oUSD einzahlen', en: 'Deposit oUSD' },
  'modal.withdraw.title': { de: 'oUSD abheben', en: 'Withdraw oUSD' },
  'modal.faucet.title': { de: '🚰 Testnet Faucet', en: '🚰 Testnet Faucet' },
  'modal.settings.title': { de: '⚙️ Einstellungen', en: '⚙️ Settings' },
  'modal.confirm.order': { de: 'Order bestätigen', en: 'Confirm Order' },
  'modal.confirm.closePosition': { de: 'Position schließen', en: 'Close Position' },
  'modal.confirm.cancelOrder': { de: 'Order abbrechen', en: 'Cancel Order' },
  
  // Settings
  'settings.slippage': { de: 'Slippage-Toleranz', en: 'Slippage Tolerance' },
  'settings.slippage.desc': { de: 'Ihre Transaktion wird rückgängig gemacht, wenn sich der Preis ungünstig um mehr als diesen Prozentsatz ändert.', en: 'Your transaction will revert if the price changes unfavorably by more than this percentage.' },
  'settings.confirmations': { de: 'Transaktionsbestätigungen', en: 'Transaction Confirmations' },
  'settings.confirmations.desc': { de: 'Bestätigungsdialog vor Trades anzeigen', en: 'Show confirmation dialog before trades' },
  'settings.notifications': { de: 'Benachrichtigungen', en: 'Notifications' },
  'settings.notifications.sound': { de: 'Sound-Benachrichtigungen aktivieren', en: 'Enable sound notifications' },
  'settings.display': { de: 'Anzeige', en: 'Display' },
  'settings.display.compact': { de: 'Kompaktmodus (kleinere UI-Elemente)', en: 'Compact mode (smaller UI elements)' },
  'settings.language': { de: 'Sprache', en: 'Language' },
  'settings.language.desc': { de: 'Interface-Sprache wählen (Deutsch/English).', en: 'Choose the interface language (Deutsch/English).' },
  'settings.language.de': { de: 'Deutsch', en: 'Deutsch' },
  'settings.language.en': { de: 'Englisch', en: 'English' },
  
  // Network
  'network.wrong': { de: 'Sie sind mit dem falschen Netzwerk verbunden. Bitte wechseln Sie zu Sepolia Testnet.', en: "You're connected to the wrong network. Please switch to Sepolia Testnet." },
  'network.switch': { de: 'Zu Sepolia wechseln', en: 'Switch to Sepolia' },
  
  // Errors
  'error.network': { de: 'Netzwerkfehler', en: 'Network Error' },
  'error.invalidInput': { de: 'Ungültige Eingabe', en: 'Invalid Input' },
  'error.insufficientBalance': { de: 'Unzureichendes Guthaben', en: 'Insufficient Balance' },
};

type I18nContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('obsidian-language');
    return (saved === 'de' || saved === 'en') ? saved : 'en';
  });

  useEffect(() => {
    localStorage.setItem('obsidian-language', language);
  }, [language]);

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }
    return translation[language] || translation.en;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
