import React, { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { COLLATERAL_ABI, COLLATERAL_ADDRESS, ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY } from '../contracts';
import { formatNumber, formatUsd } from '../lib/format';
import { Position } from '@dbs/shared';

type AccountPanelProps = {
  positions: Position[];
  onDeposit: () => void;
  onWithdraw: () => void;
  onFaucet: () => void;
};

export default function AccountPanel({ positions, onDeposit, onWithdraw, onFaucet }: AccountPanelProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [engineBalance, setEngineBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadBalances() {
      if (!publicClient || !address || !ENGINE_READY) {
        setWalletBalance(0);
        setEngineBalance(0);
        return;
      }

      setLoading(true);
      try {
        const [walletBal, engineBal] = await Promise.all([
          publicClient.readContract({
            address: COLLATERAL_ADDRESS,
            abi: COLLATERAL_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({
            address: ENGINE_ADDRESS,
            abi: ENGINE_ABI,
            functionName: 'collateralBalance',
            args: [address],
          }),
        ]);

        setWalletBalance(Number(formatUnits(walletBal as bigint, 18)));
        setEngineBalance(Number(formatUnits(engineBal as bigint, 18)));
      } catch (err) {
        console.error('Failed to load balances:', err);
      } finally {
        setLoading(false);
      }
    }

    loadBalances();
    const interval = setInterval(loadBalances, 10000);
    return () => clearInterval(interval);
  }, [publicClient, address]);

  // Calculate margin stats
  // NOTE: In the PerpEngine contract, `collateralBalance` is "free collateral".
  // Margin locked inside positions is stored separately in each Position struct.
  const totalMarginLocked = positions.reduce((sum, p) => sum + p.margin, 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalEngineCollateral = engineBalance + totalMarginLocked;
  const equity = totalEngineCollateral + totalUnrealizedPnl;
  // Available collateral for NEW positions (per current contract logic) is the free collateral only.
  const availableCollateral = Math.max(0, engineBalance);
  // Simple utilization metric (not a liquidation health metric).
  const utilization = totalEngineCollateral > 0 ? (totalMarginLocked / totalEngineCollateral) * 100 : 0;

  // Health color
  const getHealthColor = () => {
    if (utilization < 50) return 'var(--emerald)';
    if (utilization < 75) return 'var(--gold)';
    return 'var(--crimson)';
  };

  if (!isConnected) {
    return (
      <div className="panel account-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Account</p>
            <h3>Connect wallet</h3>
          </div>
        </div>
        <p className="muted">Connect your wallet to view account details and start trading.</p>
      </div>
    );
  }

  return (
    <div className="panel account-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Account overview</p>
          <h3>{formatUsd(equity, 2)}</h3>
        </div>
        <div className="health-badge" style={{ '--health-color': getHealthColor() } as React.CSSProperties}>
          {utilization < 50 ? 'Healthy' : utilization < 75 ? 'Moderate' : 'At Risk'}
        </div>
      </div>

      <div className="account-stats">
        <div className="stat-row">
          <span className="label">Wallet Balance</span>
          <span>{loading ? '...' : `${formatNumber(walletBalance, 2)} oUSD`}</span>
        </div>
        <div className="stat-row">
          <span className="label">Engine (Free)</span>
          <span>{loading ? '...' : `${formatNumber(engineBalance, 2)} oUSD`}</span>
        </div>
        <div className="stat-row">
          <span className="label">Margin Locked</span>
          <span>{formatUsd(totalMarginLocked, 2)}</span>
        </div>
        <div className="stat-row">
          <span className="label">Engine (Total)</span>
          <span>{formatUsd(totalEngineCollateral, 2)}</span>
        </div>
        <div className="stat-row">
          <span className="label">Unrealized P&L</span>
          <span className={totalUnrealizedPnl >= 0 ? 'text-positive' : 'text-negative'}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}{formatUsd(totalUnrealizedPnl, 2)}
          </span>
        </div>
        <div className="stat-row">
          <span className="label">Available (Free)</span>
          <span>{formatUsd(availableCollateral, 2)}</span>
        </div>
        <div className="stat-row">
          <span className="label">Utilization</span>
          <span style={{ color: getHealthColor() }}>{formatNumber(utilization, 1)}%</span>
        </div>
      </div>

      <div className="margin-bar">
        <div
          className="margin-bar-fill"
          style={{ width: `${Math.min(utilization, 100)}%`, background: getHealthColor() }}
        />
      </div>

      <div className="account-actions">
        <button className="btn primary" onClick={onDeposit}>
          Deposit
        </button>
        <button className="btn secondary" onClick={onWithdraw}>
          Withdraw
        </button>
        <button className="btn ghost" onClick={onFaucet}>
          Faucet
        </button>
      </div>
    </div>
  );
}

