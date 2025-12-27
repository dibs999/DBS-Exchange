import React, { useState, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { useI18n } from '../lib/i18n';
import { FocusTrap } from './Accessibility';
import ConfirmDialog from './ConfirmDialog';

type OnboardingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

const STEPS = [
  {
    id: 'welcome',
    title: { de: 'Willkommen bei Obsidian Drift', en: 'Welcome to Obsidian Drift' },
    content: {
      de: 'Eine dezentrale Perpetuals-Börse auf Sepolia Testnet. Handeln Sie mit Hebel und verwalten Sie Ihre Positionen on-chain.',
      en: 'A decentralized perpetuals exchange on Sepolia Testnet. Trade with leverage and manage your positions on-chain.',
    },
  },
  {
    id: 'wallet',
    title: { de: 'Wallet verbinden', en: 'Connect Wallet' },
    content: {
      de: 'Verbinden Sie Ihr Wallet, um zu handeln. Stellen Sie sicher, dass Sie auf Sepolia Testnet sind.',
      en: 'Connect your wallet to start trading. Make sure you are on Sepolia Testnet.',
    },
  },
  {
    id: 'deposit',
    title: { de: 'oUSD einzahlen', en: 'Deposit oUSD' },
    content: {
      de: 'Einzahlen Sie oUSD als Collateral für Ihre Positionen. Sie können jederzeit ungenutztes Collateral abheben.',
      en: 'Deposit oUSD as collateral for your positions. You can withdraw unused collateral at any time.',
    },
  },
  {
    id: 'trade',
    title: { de: 'Erste Position öffnen', en: 'Open Your First Position' },
    content: {
      de: 'Wählen Sie einen Markt, geben Sie Größe und Hebel ein, und platzieren Sie Ihre Order. Achten Sie auf den Preis-Impact und Liquidationsrisiko.',
      en: 'Select a market, enter size and leverage, and place your order. Watch out for price impact and liquidation risk.',
    },
  },
];

export default function OnboardingModal({ isOpen, onClose, onComplete }: OnboardingModalProps) {
  const { t, language } = useI18n();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [currentStep, setCurrentStep] = useState(0);
  const [skipOnboarding, setSkipOnboarding] = useState(false);

  useEffect(() => {
    const hasCompleted = localStorage.getItem('obsidian-onboarding-completed');
    if (hasCompleted === 'true') {
      setSkipOnboarding(true);
    }
  }, []);

  if (!isOpen || skipOnboarding) return null;

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const isWalletStep = step.id === 'wallet';
  const walletConnected = isConnected && chainId === sepolia.id;

  function handleNext() {
    if (isLastStep) {
      localStorage.setItem('obsidian-onboarding-completed', 'true');
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  }

  function handleSkip() {
    localStorage.setItem('obsidian-onboarding-completed', 'true');
    onClose();
  }

  return (
    <FocusTrap isActive={isOpen}>
      <div className="modal-overlay" onClick={handleSkip}>
        <div className="modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
          <div className="onboarding-header">
            <div className="onboarding-progress">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`progress-dot ${idx <= currentStep ? 'active' : ''}`}
                />
              ))}
            </div>
            <button
              className="modal-close"
              onClick={handleSkip}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>

          <div className="onboarding-content">
            <h2>{step.title[language]}</h2>
            <p className="muted">{step.content[language]}</p>

            {isWalletStep && !walletConnected && (
              <div className="onboarding-action">
                <p className="muted small">
                  {chainId !== sepolia.id
                    ? t('network.wrong')
                    : 'Bitte verbinden Sie Ihr Wallet über den Button in der Topbar.'}
                </p>
              </div>
            )}

            {isWalletStep && walletConnected && (
              <div className="onboarding-success">
                <span className="text-positive">✓ Wallet verbunden</span>
              </div>
            )}
          </div>

          <div className="onboarding-footer">
            <button className="btn ghost" onClick={handleSkip}>
              {t('common.cancel')}
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn primary"
              onClick={handleNext}
              disabled={isWalletStep && !walletConnected}
            >
              {isLastStep ? t('common.save') : 'Weiter →'}
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}

