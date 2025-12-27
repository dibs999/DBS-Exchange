import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Settings = {
  slippageTolerancePct: number; // informational for MVP (no on-chain enforcement)
  showConfirmations: boolean;
  soundEnabled: boolean;
  compactMode: boolean;
  oneClickMode: boolean; // Skip confirmations AND submit immediately on side selection
  defaultOrderSize: string; // Default size for quick trading
  theme: 'dark' | 'light'; // UI theme
};

export const DEFAULT_SETTINGS: Settings = {
  slippageTolerancePct: 0.5,
  showConfirmations: true,
  soundEnabled: false,
  compactMode: false,
  oneClickMode: false,
  defaultOrderSize: '0.1',
  theme: 'dark',
};

const STORAGE_KEY = 'obsidian-settings';

type SettingsContextValue = {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    return readStoredSettings();
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  const value = useMemo(() => ({ settings, setSettings }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}


