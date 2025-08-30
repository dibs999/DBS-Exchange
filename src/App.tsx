import React, { useState } from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config';

// The full application UI will be built on top of the local simulation and
// on-chain utilities exported from other modules. For now this file hosts a
// small interactive shell that demonstrates a language switcher and a more
// polished layout.

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

export function AppBody() {
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const t = translations[language];

  return (
    <div className="min-h-screen w-full bg-black text-neutral-100">
      <header className="flex items-center justify-between p-4 border-b border-neutral-700">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <select
          className="rounded bg-neutral-900 text-neutral-100 p-1"
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </header>
      <main className="p-4">
        <p>{t.welcome}</p>
      </main>
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
