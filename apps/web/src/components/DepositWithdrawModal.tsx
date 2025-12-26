import React, { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { COLLATERAL_ABI, COLLATERAL_ADDRESS, ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY } from '../contracts';
import { formatNumber } from '../lib/format';
import { useToast } from './Toast';

type DepositWithdrawModalProps = {
  mode: 'deposit' | 'withdraw';
  isOpen: boolean;
  onClose: () => void;
};

export default function DepositWithdrawModal({ mode, isOpen, onClose }: DepositWithdrawModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();

  const [amount, setAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!publicClient || !address || !ENGINE_READY) return;

      try {
        if (mode === 'deposit') {
          const [balance, currentAllowance] = await Promise.all([
            publicClient.readContract({
              address: COLLATERAL_ADDRESS,
              abi: COLLATERAL_ABI,
              functionName: 'balanceOf',
              args: [address],
            }),
            publicClient.readContract({
              address: COLLATERAL_ADDRESS,
              abi: COLLATERAL_ABI,
              functionName: 'allowance',
              args: [address, ENGINE_ADDRESS],
            }),
          ]);
          setMaxAmount(Number(formatUnits(balance as bigint, 18)));
          setAllowance(currentAllowance as bigint);
        } else {
          const balance = await publicClient.readContract({
            address: ENGINE_ADDRESS,
            abi: ENGINE_ABI,
            functionName: 'collateralBalance',
            args: [address],
          });
          setMaxAmount(Number(formatUnits(balance as bigint, 18)));
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

  const amountBigInt = amount ? parseUnits(amount, 18) : 0n;
  const needsApproval = mode === 'deposit' && amountBigInt > allowance;

  async function handleApprove() {
    if (!walletClient || !publicClient || !address) return;

    setLoading(true);
    try {
      const { request } = await publicClient.simulateContract({
        address: COLLATERAL_ADDRESS,
        abi: COLLATERAL_ABI,
        functionName: 'approve',
        args: [ENGINE_ADDRESS, amountBigInt],
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

    setLoading(true);
    try {
      const functionName = mode === 'deposit' ? 'deposit' : 'withdraw';
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
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
        message: `${amount} oUSD ${mode === 'deposit' ? 'deposited' : 'withdrawn'} successfully.`,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'deposit' ? 'Deposit oUSD' : 'Withdraw oUSD'}</h3>
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
              Available: {formatNumber(maxAmount, 2)} oUSD
            </p>
          </div>

          {mode === 'deposit' && (
            <div className="modal-info">
              <p className="muted small">
                Deposited oUSD is used as collateral for your perpetual positions. 
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
              {loading ? 'Approving...' : 'Approve oUSD'}
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
    </div>
  );
}

