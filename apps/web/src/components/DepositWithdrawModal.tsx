import React, { useEffect, useState, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { COLLATERAL_ABI, COLLATERAL_ADDRESS, ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY } from '../contracts';
import {
  CHAIN_ID_V2,
  COLLATERAL_V2_ADDRESS,
  ENGINE_V2_ADDRESS,
  ENGINE_V2_READY,
  PERP_ENGINE_V2_ABI,
  USDC_ABI,
} from '../contracts-v2';
import { formatNumber } from '../lib/format';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';
import { FocusTrap } from './Accessibility';

type DepositWithdrawModalProps = {
  mode: 'deposit' | 'withdraw';
  isOpen: boolean;
  onClose: () => void;
};

export default function DepositWithdrawModal({ mode, isOpen, onClose }: DepositWithdrawModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();

  const useV2 = ENGINE_V2_READY && chainId === CHAIN_ID_V2;
  const engineReady = useV2 ? ENGINE_V2_READY : ENGINE_READY;
  const engineAddress = useV2 ? ENGINE_V2_ADDRESS : ENGINE_ADDRESS;
  const engineAbi = useV2 ? PERP_ENGINE_V2_ABI : ENGINE_ABI;
  const collateralAddress = useV2 ? COLLATERAL_V2_ADDRESS : COLLATERAL_ADDRESS;
  const collateralAbi = useV2 ? USDC_ABI : COLLATERAL_ABI;
  const decimals = useV2 ? 6 : 18;

  const [amount, setAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tokenLabel = useV2 ? 'USDC' : 'oUSD';

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

  useEffect(() => {
    async function loadData() {
      if (!publicClient || !address || !engineReady) return;

      try {
        if (mode === 'deposit') {
          const [balance, currentAllowance] = await Promise.all([
            publicClient.readContract({
              address: collateralAddress,
              abi: collateralAbi,
              functionName: 'balanceOf',
              args: [address],
            }),
            publicClient.readContract({
              address: collateralAddress,
              abi: collateralAbi,
              functionName: 'allowance',
              args: [address, engineAddress],
            }),
          ]);
          setMaxAmount(Number(formatUnits(balance as bigint, decimals)));
          setAllowance(currentAllowance as bigint);
        } else {
          const balance = await publicClient.readContract({
            address: engineAddress,
            abi: engineAbi,
            functionName: 'collateralBalance',
            args: [address],
          });
          setMaxAmount(Number(formatUnits(balance as bigint, useV2 ? 18 : decimals)));
        }
      } catch (err) {
        console.error('Failed to load modal data:', err);
      }
    }

    if (isOpen) {
      loadData();
      setAmount('');
    }
  }, [publicClient, address, mode, isOpen]);

  if (!isOpen) return null;

  const amountBigInt = amount ? parseUnits(amount, decimals) : 0n;
  const needsApproval = mode === 'deposit' && amountBigInt > allowance;

  async function handleApprove() {
    if (!walletClient || !publicClient || !address) return;

    setLoading(true);
    try {
      const { request } = await publicClient.simulateContract({
        address: collateralAddress,
        abi: collateralAbi,
        functionName: 'approve',
        args: [engineAddress, amountBigInt],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Approval submitted',
        message: 'Waiting for confirmation...',
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setAllowance(amountBigInt);
      addToast({
        type: 'success',
        title: 'Approval confirmed',
        message: 'You can now deposit.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Approval failed',
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!walletClient || !publicClient || !address || !amount) return;

    if (settings.showConfirmations && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    setLoading(true);
    try {
      const functionName = mode === 'deposit' ? 'deposit' : 'withdraw';
      const { request } = await publicClient.simulateContract({
        address: engineAddress,
        abi: engineAbi,
        functionName,
        args: [amountBigInt],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} submitted`,
        message: 'Waiting for confirmation...',
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} confirmed`,
        message: `${amount} ${tokenLabel} ${mode === 'deposit' ? 'deposited' : 'withdrawn'} successfully.`,
      });
      onClose();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} failed`,
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <FocusTrap isActive={isOpen}>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby={`${mode}-modal-title`}>
          <div className="modal-header">
          <h3>{mode === 'deposit' ? `Deposit ${tokenLabel}` : `Withdraw ${tokenLabel}`}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="input-group">
            <label>Amount</label>
            <div className="input-with-max">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
              />
              <button className="btn-max" onClick={() => setAmount(maxAmount.toString())}>
                MAX
              </button>
            </div>
            <p className="input-hint">
              Available: {formatNumber(maxAmount, 2)} {tokenLabel}
            </p>
          </div>

          {mode === 'deposit' && (
            <div className="modal-info">
              <p className="muted small">
                Deposited {tokenLabel} is used as collateral for your perpetual positions. 
                You can withdraw unused collateral at any time.
              </p>
            </div>
          )}

          {mode === 'withdraw' && (
            <div className="modal-info">
              <p className="muted small">
                You can only withdraw collateral that is not being used as margin for open positions.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {needsApproval ? (
            <button className="btn secondary" onClick={handleApprove} disabled={loading || !amount}>
              {loading ? 'Approving...' : `Approve ${tokenLabel}`}
            </button>
          ) : null}
          <button
            className="btn primary"
            onClick={handleSubmit}
            disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount || needsApproval}
          >
            {loading ? 'Processing...' : mode === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={mode === 'deposit' ? 'Confirm deposit' : 'Confirm withdrawal'}
        message="Please confirm the details below. This will submit an on-chain transaction."
        confirmText={mode === 'deposit' ? 'Deposit' : 'Withdraw'}
        cancelText="Cancel"
        variant={mode === 'withdraw' ? 'danger' : 'warning'}
        details={[
          { label: 'Amount', value: `${amount || '0'} ${tokenLabel}` },
          { label: 'Available', value: `${formatNumber(maxAmount, 2)} ${tokenLabel}` },
        ]}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          // execute real submit now
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          (async () => {
            if (!walletClient || !publicClient || !address || !amount) return;
            setLoading(true);
            try {
              const functionName = mode === 'deposit' ? 'deposit' : 'withdraw';
              const { request } = await publicClient.simulateContract({
                address: engineAddress,
                abi: engineAbi,
                functionName,
                args: [amountBigInt],
                account: address,
              });

              const hash = await walletClient.writeContract(request);
              addToast({
                type: 'info',
                title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} submitted`,
                message: 'Waiting for confirmation...',
                txHash: hash,
              });

              await publicClient.waitForTransactionReceipt({ hash });
              addToast({
                type: 'success',
                title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} confirmed`,
                message: `${amount} ${tokenLabel} ${mode === 'deposit' ? 'deposited' : 'withdrawn'} successfully.`,
              });
              onClose();
            } catch (err: any) {
              addToast({
                type: 'error',
                title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} failed`,
                message: err?.shortMessage || err?.message || 'Unknown error',
              });
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
        </div>
      </div>
    </FocusTrap>
  );
}
