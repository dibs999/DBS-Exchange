import React, { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, useSettings } from '../lib/settings';
import { useI18n } from '../lib/i18n';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 2.0];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, setSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const { t, language, setLanguage } = useI18n();

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleSave() {
    setSettings(localSettings);
    onClose();
  }

  function handleReset() {
    setLocalSettings(DEFAULT_SETTINGS);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('modal.settings.title')}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Slippage Tolerance */}
          <div className="settings-section">
            <h4>Slippage Tolerance</h4>
            <p className="muted small">
              MVP Hinweis: Dieses Setting ist aktuell nur ein Sicherheits-/UX-Warnwert (keine On-Chain Durchsetzung).
            </p>
            <div className="slippage-options">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`slippage-btn ${localSettings.slippageTolerancePct === preset ? 'active' : ''}`}
                  onClick={() => setLocalSettings({ ...localSettings, slippageTolerancePct: preset })}
                >
                  {preset}%
                </button>
              ))}
              <div className="slippage-custom">
                <input
                  type="number"
                  value={localSettings.slippageTolerancePct}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, slippageTolerancePct: Number(e.target.value || 0) })
                  }
                  step="0.1"
                  min="0.01"
                  max="50"
                />
                <span>%</span>
              </div>
            </div>
            {Number(localSettings.slippageTolerancePct) > 5 && (
              <p className="warning-text">⚠️ High slippage tolerance. Your trade may be frontrun.</p>
            )}
          </div>

          {/* Confirmations */}
          <div className="settings-section">
            <h4>Transaction Confirmations</h4>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={localSettings.showConfirmations}
                onChange={(e) => setLocalSettings({ ...localSettings, showConfirmations: e.target.checked })}
              />
              <span>Show confirmation dialog before trades</span>
            </label>
          </div>

          {/* One-Click Trading */}
          <div className="settings-section">
            <h4>⚡ One-Click Trading</h4>
            <p className="muted small">
              Execute trades instantly without confirmations. Use with caution!
            </p>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={localSettings.oneClickMode}
                onChange={(e) => setLocalSettings({
                  ...localSettings,
                  oneClickMode: e.target.checked,
                  showConfirmations: e.target.checked ? false : localSettings.showConfirmations
                })}
              />
              <span>Enable One-Click Mode</span>
            </label>
            {localSettings.oneClickMode && (
              <div style={{ marginTop: 12 }}>
                <label>
                  Default Order Size (ETH)
                  <input
                    type="number"
                    value={localSettings.defaultOrderSize}
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultOrderSize: e.target.value })}
                    step="0.01"
                    min="0.01"
                    style={{ marginLeft: 8, width: 80 }}
                  />
                </label>
              </div>
            )}
            {localSettings.oneClickMode && (
              <p className="warning-text" style={{ marginTop: 8 }}>
                ⚠️ One-Click Mode enabled. Orders will execute immediately!
              </p>
            )}
          </div>

          {/* Sound */}
          <div className="settings-section">
            <h4>Notifications</h4>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={localSettings.soundEnabled}
                onChange={(e) => setLocalSettings({ ...localSettings, soundEnabled: e.target.checked })}
              />
              <span>Enable sound notifications</span>
            </label>
          </div>

          {/* Display */}
          <div className="settings-section">
            <h4>Display</h4>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={localSettings.compactMode}
                onChange={(e) => setLocalSettings({ ...localSettings, compactMode: e.target.checked })}
              />
              <span>Compact mode (smaller UI elements)</span>
            </label>
          </div>

          {/* Theme */}
          <div className="settings-section">
            <h4>🎨 Theme</h4>
            <p className="muted small">Choose your preferred appearance</p>
            <div className="slippage-options" style={{ marginTop: 8 }}>
              <button
                className={`slippage-btn ${localSettings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, theme: 'dark' })}
              >
                🌙 Dark
              </button>
              <button
                className={`slippage-btn ${localSettings.theme === 'light' ? 'active' : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, theme: 'light' })}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="settings-section">
            <h4>{t('settings.language')}</h4>
            <p className="muted small">{t('settings.language.desc')}</p>
            <div className="slippage-options">
              <button
                className={`slippage-btn ${language === 'de' ? 'active' : ''}`}
                onClick={() => setLanguage('de')}
              >
                {t('settings.language.de')}
              </button>
              <button
                className={`slippage-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                {t('settings.language.en')}
              </button>
            </div>
          </div>

          {/* Keyboard Shortcuts Info */}
          <div className="settings-section">
            <h4>Keyboard Shortcuts</h4>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <kbd>Esc</kbd>
                <span>Close modals</span>
              </div>
              <div className="shortcut-item">
                <kbd>D</kbd>
                <span>Open deposit</span>
              </div>
              <div className="shortcut-item">
                <kbd>W</kbd>
                <span>Open withdraw</span>
              </div>
              <div className="shortcut-item">
                <kbd>L</kbd>
                <span>Switch to Long</span>
              </div>
              <div className="shortcut-item">
                <kbd>S</kbd>
                <span>Switch to Short</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button className="btn primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
