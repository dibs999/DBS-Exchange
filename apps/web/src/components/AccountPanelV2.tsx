import React, { useEffect, useState } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { Position } from '@dbs/shared';
import {
  CHAIN_ID_V2,
  COLLATERAL_V2_ADDRESS,
  ENGINE_V2_ADDRESS,
  ENGINE_V2_READY,
  PERP_ENGINE_V2_ABI,
  USDC_ABI,
} from '../contracts-v2';
import { formatNumber, formatUsd } from '../lib/format';

type AccountPanelV2Props = {
  positions: Position[];
  onDeposit: () => void;
  onWithdraw: () => void;
};

export default function AccountPanelV2({ positions, onDeposit, onWithdraw }: AccountPanelV2Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [engineBalance, setEngineBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadBalances() {
      if (!publicClient || !address || !ENGINE_V2_READY || chainId !== CHAIN_ID_V2) {
        setWalletBalance(0);
        setEngineBalance(0);
        return;
      }

      setLoading(true);
      try {
        const [walletBal, engineBal] = await Promise.all([
          publicClient.readContract({
            address: COLLATERAL_V2_ADDRESS,
            abi: USDC_ABI,
            functionName: 'balanceOf',
            args: [address],
          }),
          publicClient.readContract({
            address: ENGINE_V2_ADDRESS,
            abi: PERP_ENGINE_V2_ABI,
            functionName: 'collateralBalance',
            args: [address],
          }),
        ]);

        setWalletBalance(Number(formatUnits(walletBal as bigint, 6)));
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
  }, [publicClient, address, chainId, ENGINE_V2_READY, CHAIN_ID_V2]);

  const totalMarginLocked = positions.reduce((sum, p) => sum + p.margin, 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalEngineCollateral = engineBalance + totalMarginLocked;
  const equity = totalEngineCollateral + totalUnrealizedPnl;
  const availableCollateral = Math.max(0, engineBalance);
  const utilization = totalEngineCollateral > 0 ? (totalMarginLocked / totalEngineCollateral) * 100 : 0;

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

  if (chainId !== CHAIN_ID_V2) {
    return (
      <div className="panel account-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Account</p>
            <h3>Wrong network</h3>
          </div>
        </div>
        <p className="muted">Switch to Base to view V2 balances.</p>
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
          <span>{loading ? '...' : `${formatNumber(walletBalance, 2)} USDC`}</span>
        </div>
        <div className="stat-row">
          <span className="label">Engine (Free)</span>
          <span>{loading ? '...' : `${formatNumber(engineBalance, 2)} USDC`}</span>
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
      </div>
    </div>
  );
}
