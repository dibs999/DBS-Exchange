import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { FAUCET_ADDRESS } from '../contracts';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';
import { useI18n } from '../lib/i18n';
import { FocusTrap } from './Accessibility';

// Faucet Contract ABI
const FAUCET_ABI = [
  {
    type: 'function',
    name: 'request',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'canRequest',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'bool' },
      { name: '', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'getRemainingDailyLimit',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cooldownPeriod',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'lastRequestTime',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

type FaucetModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const FAUCET_AMOUNTS = [
  { label: '1,000 oUSD', value: '1000' },
  { label: '5,000 oUSD', value: '5000' },
  { label: '10,000 oUSD', value: '10000' },
];

export default function FaucetModal({ isOpen, onClose }: FaucetModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();
  const { t } = useI18n();

  const [selectedAmount, setSelectedAmount] = useState(FAUCET_AMOUNTS[1].value);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);
  const [remainingDaily, setRemainingDaily] = useState<string | null>(null);

  // Check if user can request
  const { data: canRequestData } = useReadContract({
    address: FAUCET_ADDRESS || undefined,
    abi: FAUCET_ABI,
    functionName: 'canRequest',
    args: address && selectedAmount ? [address, parseUnits(selectedAmount, 18)] : undefined,
    query: { enabled: !!FAUCET_ADDRESS && !!address && isOpen },
  });

  // Get remaining daily limit
  const { data: remainingLimit } = useReadContract({
    address: FAUCET_ADDRESS || undefined,
    abi: FAUCET_ABI,
    functionName: 'getRemainingDailyLimit',
    args: address ? [address] : undefined,
    query: { enabled: !!FAUCET_ADDRESS && !!address && isOpen },
  });

  // Get cooldown period
  const { data: cooldownPeriod } = useReadContract({
    address: FAUCET_ADDRESS || undefined,
    abi: FAUCET_ABI,
    functionName: 'cooldownPeriod',
    query: { enabled: !!FAUCET_ADDRESS && isOpen },
  });

  // Get last request time
  const { data: lastRequestTime } = useReadContract({
    address: FAUCET_ADDRESS || undefined,
    abi: FAUCET_ABI,
    functionName: 'lastRequestTime',
    args: address ? [address] : undefined,
    query: { enabled: !!FAUCET_ADDRESS && !!address && isOpen },
  });

  // Update cooldown timer
  useEffect(() => {
    if (!cooldownPeriod || !lastRequestTime) {
      setCooldownRemaining(null);
      return;
    }

    const updateCooldown = () => {
      const now = Math.floor(Date.now() / 1000);
      const lastTime = Number(lastRequestTime);
      const cooldown = Number(cooldownPeriod);
      const remaining = Math.max(0, lastTime + cooldown - now);
      setCooldownRemaining(remaining);
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [cooldownPeriod, lastRequestTime]);

  // Update remaining daily limit
  useEffect(() => {
    if (remainingLimit) {
      setRemainingDaily(formatUnits(remainingLimit, 18));
    }
  }, [remainingLimit]);

  // Handle ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  async function handleRequest() {
    if (!walletClient || !publicClient || !address || !FAUCET_ADDRESS) {
      addToast({
        type: 'error',
        title: t('error.network'),
        message: 'Faucet contract not configured',
      });
      return;
    }

    if (settings.showConfirmations && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    setLoading(true);
    try {
      const amountBigInt = parseUnits(selectedAmount, 18);
      
      const { request } = await publicClient.simulateContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'request',
        args: [amountBigInt],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: t('modal.faucet.title'),
        message: 'Requesting testnet oUSD...',
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Faucet successful!',
        message: `${selectedAmount} oUSD has been sent to your wallet.`,
      });
      onClose();
    } catch (err: any) {
      const errorMsg = err?.shortMessage || err?.message || 'Unknown error';
      addToast({
        type: 'error',
        title: 'Faucet failed',
        message: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  }

  const canRequest = canRequestData?.[0] === true;
  const requestError = canRequestData?.[1] || '';
  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <FocusTrap isActive={isOpen}>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="faucet-title">
          <div className="modal-header">
            <h3 id="faucet-title">{t('modal.faucet.title')}</h3>
            <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
          </div>

        <div className="modal-body">
          <p className="muted">
            Get free oUSD testnet tokens to start trading on Sepolia.
          </p>

          <div className="faucet-amounts">
            {FAUCET_AMOUNTS.map((amt) => (
              <button
                key={amt.value}
                className={`faucet-amount-btn ${selectedAmount === amt.value ? 'active' : ''}`}
                onClick={() => setSelectedAmount(amt.value)}
              >
                {amt.label}
              </button>
            ))}
          </div>

          <div className="faucet-info">
            <div className="info-row">
              <span className="label">Network</span>
              <span>Sepolia Testnet</span>
            </div>
            <div className="info-row">
              <span className="label">Token</span>
              <span>oUSD (Obsidian USD)</span>
            </div>
            <div className="info-row">
              <span className="label">Amount</span>
              <span>{selectedAmount} oUSD</span>
            </div>
            {remainingDaily && (
              <div className="info-row">
                <span className="label">Remaining (today)</span>
                <span>{Number(remainingDaily).toLocaleString()} oUSD</span>
              </div>
            )}
            {cooldownRemaining !== null && cooldownRemaining > 0 && (
              <div className="info-row">
                <span className="label">Cooldown</span>
                <span className="text-warning">{formatCooldown(cooldownRemaining)}</span>
              </div>
            )}
          </div>

          {!canRequest && requestError && (
            <div className="modal-info">
              <p className="muted small text-warning">⚠️ {requestError}</p>
            </div>
          )}

          {!FAUCET_ADDRESS && (
            <div className="modal-info">
              <p className="muted small text-warning">
                ⚠️ Faucet contract not configured. Please set VITE_FAUCET_ADDRESS.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button 
            className="btn primary" 
            onClick={handleRequest} 
            disabled={loading || !canRequest || !FAUCET_ADDRESS || (cooldownRemaining !== null && cooldownRemaining > 0)}
          >
            {loading ? t('common.loading') : 'Request oUSD'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Confirm faucet request"
        message="This will submit an on-chain transaction to request testnet oUSD."
        confirmText="Request"
        cancelText={t('common.cancel')}
        variant="warning"
        details={[
          { label: 'Amount', value: `${selectedAmount} oUSD` },
          { label: 'Token', value: 'oUSD' },
          { label: 'Network', value: 'Sepolia' },
        ]}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          handleRequest();
        }}
      />
      </div>
    </FocusTrap>
  );
}

