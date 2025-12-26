import React, { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { COLLATERAL_ADDRESS, COLLATERAL_ABI } from '../contracts';
import { formatNumber, formatPct, formatUsd } from '../lib/format';
import { useToast } from './Toast';

type VaultStats = {
  totalDeposited: number;
  userDeposit: number;
  userShare: number;
  apy: number;
  pendingRewards: number;
  utilizationRate: number;
};

// Mock vault stats
const mockVaultStats: VaultStats = {
  totalDeposited: 8400000,
  userDeposit: 0,
  userShare: 0,
  apy: 12.4,
  pendingRewards: 0,
  utilizationRate: 68.5,
};

export default function LPVault() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();

  const [stats, setStats] = useState<VaultStats>(mockVaultStats);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!publicClient || !address) {
        setWalletBalance(0);
        return;
      }

      try {
        const balance = await publicClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: COLLATERAL_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
        setWalletBalance(Number(formatUnits(balance as bigint, 18)));

        // In a real implementation, you'd fetch vault stats here
        // For now, we simulate some user deposit
        setStats({
          ...mockVaultStats,
          userDeposit: Math.random() > 0.5 ? 5000 : 0,
          userShare: Math.random() > 0.5 ? 0.06 : 0,
          pendingRewards: Math.random() > 0.5 ? 12.5 : 0,
        });
      } catch (err) {
        console.error('Failed to load vault data:', err);
      }
    }

    loadData();
  }, [publicClient, address]);

  const maxAmount = mode === 'deposit' ? walletBalance : stats.userDeposit;

  async function handleSubmit() {
    if (!walletClient || !publicClient || !address || !amount) return;

    setLoading(true);
    try {
      // This is a placeholder - in a real implementation, you'd call the vault contract
      addToast({
        type: 'info',
        title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} submitted`,
        message: 'Processing your request...',
      });

      // Simulate transaction
      await new Promise(resolve => setTimeout(resolve, 2000));

      addToast({
        type: 'success',
        title: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} successful`,
        message: `${amount} oUSD ${mode === 'deposit' ? 'deposited to' : 'withdrawn from'} the vault.`,
      });

      setAmount('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Transaction failed',
        message: err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimRewards() {
    if (!walletClient || !address) return;

    setLoading(true);
    try {
      addToast({
        type: 'info',
        title: 'Claiming rewards',
        message: 'Processing your claim...',
      });

      await new Promise(resolve => setTimeout(resolve, 1500));

      addToast({
        type: 'success',
        title: 'Rewards claimed!',
        message: `${formatNumber(stats.pendingRewards, 2)} oUSD has been added to your wallet.`,
      });

      setStats(prev => ({ ...prev, pendingRewards: 0 }));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Claim failed',
        message: err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel lp-vault-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Liquidity provision</p>
          <h3>oUSD Vault</h3>
        </div>
        <div className="vault-apy">
          <span className="label">APY</span>
          <span className="apy-value text-positive">{formatPct(stats.apy)}</span>
        </div>
      </div>

      <div className="vault-stats">
        <div className="vault-stat-card">
          <span className="label">Total Value Locked</span>
          <strong>{formatCompact(stats.totalDeposited)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Utilization Rate</span>
          <strong>{formatPct(stats.utilizationRate)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Your Deposit</span>
          <strong>{formatUsd(stats.userDeposit, 2)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Your Share</span>
          <strong>{formatPct(stats.userShare * 100)}</strong>
        </div>
      </div>

      {stats.pendingRewards > 0 && (
        <div className="vault-rewards">
          <div className="rewards-info">
            <span className="label">Pending Rewards</span>
            <strong className="text-positive">{formatUsd(stats.pendingRewards, 2)}</strong>
          </div>
          <button className="btn secondary" onClick={handleClaimRewards} disabled={loading}>
            Claim
          </button>
        </div>
      )}

      {isConnected ? (
        <div className="vault-actions">
          <div className="vault-tabs">
            <button
              className={mode === 'deposit' ? 'active' : ''}
              onClick={() => setMode('deposit')}
            >
              Deposit
            </button>
            <button
              className={mode === 'withdraw' ? 'active' : ''}
              onClick={() => setMode('withdraw')}
            >
              Withdraw
            </button>
          </div>

          <div className="input-group">
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

          <button
            className="btn primary"
            onClick={handleSubmit}
            disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
          >
            {loading ? 'Processing...' : mode === 'deposit' ? 'Deposit to Vault' : 'Withdraw from Vault'}
          </button>
        </div>
      ) : (
        <p className="muted small">Connect wallet to deposit or withdraw.</p>
      )}

      <div className="vault-info">
        <p className="muted small">
          Deposit oUSD to provide liquidity for perpetual traders. Earn yield from trading fees 
          and funding payments. Withdrawals may be subject to utilization limits.
        </p>
      </div>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

