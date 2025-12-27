import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { formatNumber, formatPct, formatUsd } from '../lib/format';
import { useToast } from './Toast';
import {
  CHAIN_ID_V2,
  COLLATERAL_V2_ADDRESS,
  USDC_ABI,
  VAULT_ABI,
  VAULT_ADDRESS,
  VAULT_READY,
} from '../contracts-v2';
import { API_URL } from '../lib/api';

type VaultSummary = {
  totalAssets: number;
  totalSupply: number;
  pricePerShare: number;
  utilization: number;
  apy: number | null;
  netDeposits: number;
};

type VaultAccount = {
  shares: number;
  assets: number;
  pricePerShare: number;
  lifetimeDeposits: number;
  lifetimeWithdrawals: number;
};

type VaultActivity = {
  id: number;
  address: string;
  amount: number;
  shares: number;
  type: 'deposit' | 'withdraw';
  txHash?: string;
  createdAt: string | null;
};

const USDC_DECIMALS = 6;
const ONE_E18 = 1_000_000_000_000_000_000n;

export default function LPVault() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();

  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [account, setAccount] = useState<VaultAccount | null>(null);
  const [activity, setActivity] = useState<VaultActivity[]>([]);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [totalAssetsRaw, setTotalAssetsRaw] = useState<bigint>(0n);
  const [totalSupplyRaw, setTotalSupplyRaw] = useState<bigint>(0n);

  const pricePerShare = useMemo(() => computePrice(totalAssetsRaw, totalSupplyRaw), [totalAssetsRaw, totalSupplyRaw]);

  const loadSummary = useCallback(async () => {
    if (!publicClient || !VAULT_READY) {
      setSummary(null);
      return;
    }

    try {
      const [assetsRaw, supplyRaw] = await Promise.all([
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'totalAssets',
        }),
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'totalSupply',
        }),
      ]);

      const assetsRawBig = assetsRaw as bigint;
      const supplyRawBig = supplyRaw as bigint;
      const computedPrice = computePrice(assetsRawBig, supplyRawBig);

      setTotalAssetsRaw(assetsRawBig);
      setTotalSupplyRaw(supplyRawBig);

      let apiSummary: VaultSummary | null = null;
      try {
        const res = await fetch(`${API_URL}/v2/vault/summary`);
        if (res.ok) {
          apiSummary = await res.json();
        }
      } catch (err) {
        console.warn('Vault summary API failed, falling back to on-chain only:', err);
      }

      const fallbackSummary: VaultSummary = {
        totalAssets: Number(formatUnits(assetsRawBig, USDC_DECIMALS)),
        totalSupply: Number(formatUnits(supplyRawBig, 18)),
        pricePerShare: computedPrice,
        utilization: 0,
        apy: null,
        netDeposits: Number(formatUnits(assetsRawBig, USDC_DECIMALS)),
      };

      setSummary(
        apiSummary
          ? {
              ...apiSummary,
              pricePerShare: computedPrice,
            }
          : fallbackSummary
      );
    } catch (err) {
      console.error('Failed to load vault summary:', err);
      setSummary(null);
    }
  }, [publicClient]);

  const loadAccountData = useCallback(async () => {
    if (!publicClient || !address || !VAULT_READY || chainId !== CHAIN_ID_V2) {
      setAccount(null);
      setAllowance(0n);
      setWalletBalance(0);
      return;
    }

    try {
      const [walletBal, currentAllowance, sharesRaw] = await Promise.all([
        publicClient.readContract({
          address: COLLATERAL_V2_ADDRESS,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: COLLATERAL_V2_ADDRESS,
          abi: USDC_ABI,
          functionName: 'allowance',
          args: [address, VAULT_ADDRESS],
        }),
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);

      setWalletBalance(Number(formatUnits(walletBal as bigint, USDC_DECIMALS)));
      setAllowance(currentAllowance as bigint);

      let apiAccount: VaultAccount | null = null;
      try {
        const res = await fetch(`${API_URL}/v2/vault/account/${address}`);
        if (res.ok) {
          apiAccount = await res.json();
        }
      } catch (err) {
        console.warn('Vault account API failed, falling back to on-chain only:', err);
      }

      const shares = Number(formatUnits(sharesRaw as bigint, 18));
      const assets = pricePerShare > 0 ? shares * pricePerShare : 0;

      setAccount(
        apiAccount
          ? {
              ...apiAccount,
              pricePerShare,
            }
          : {
              shares,
              assets,
              pricePerShare,
              lifetimeDeposits: 0,
              lifetimeWithdrawals: 0,
            }
      );
    } catch (err) {
      console.error('Failed to load vault account:', err);
      setAccount(null);
    }
  }, [publicClient, address, chainId, pricePerShare]);

  const loadActivity = useCallback(async () => {
    try {
      const url = address
        ? `${API_URL}/v2/vault/activity/${address}`
        : `${API_URL}/v2/vault/activity`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setActivity(data);
      } else {
        setActivity([]);
      }
    } catch (err) {
      console.error('Failed to load vault activity:', err);
      setActivity([]);
    }
  }, [address]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAccountData();
    loadActivity();
  }, [loadAccountData, loadActivity]);

  const maxAmount = mode === 'deposit' ? walletBalance : account?.assets || 0;
  const needsApproval = mode === 'deposit' && amount ? parseUnits(amount || '0', USDC_DECIMALS) > allowance : false;

  async function ensureNetwork() {
    if (chainId !== CHAIN_ID_V2) {
      addToast({
        type: 'warning',
        title: 'Wrong network',
        message: 'Switch to Base to interact with the vault.',
      });
      return false;
    }
    if (!VAULT_READY) {
      addToast({
        type: 'error',
        title: 'Vault not configured',
        message: 'Set VITE_VAULT_ADDRESS and VITE_COLLATERAL_V2_ADDRESS to enable vault actions.',
      });
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!walletClient || !publicClient || !address || !amount) return;
    if (!(await ensureNetwork())) return;

    const amountBigInt = parseUnits(amount, USDC_DECIMALS);

    setLoading(true);
    try {
      if (mode === 'deposit' && needsApproval) {
        const { request } = await publicClient.simulateContract({
          address: COLLATERAL_V2_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [VAULT_ADDRESS, amountBigInt],
          account: address,
        });

        const approveHash = await walletClient.writeContract(request);
        addToast({
          type: 'info',
          title: 'Approval submitted',
          message: 'Approving vault to spend your USDC...',
          txHash: approveHash,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      if (mode === 'deposit') {
        const { request } = await publicClient.simulateContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'deposit',
          args: [amountBigInt],
          account: address,
        });

        const hash = await walletClient.writeContract(request);
        addToast({
          type: 'info',
          title: 'Depositing to vault',
          message: `Depositing ${amount} USDC...`,
          txHash: hash,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        addToast({
          type: 'success',
          title: 'Deposit confirmed',
          message: `${amount} USDC deposited to the vault.`,
          txHash: hash,
        });
      } else {
        if (totalAssetsRaw === 0n || totalSupplyRaw === 0n) {
          throw new Error('Vault balances unavailable');
        }
        const shareAmount = (amountBigInt * totalSupplyRaw) / totalAssetsRaw;
        if (shareAmount === 0n) {
          throw new Error('Amount too small to withdraw');
        }

        const { request } = await publicClient.simulateContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'withdraw',
          args: [shareAmount],
          account: address,
        });

        const hash = await walletClient.writeContract(request);
        addToast({
          type: 'info',
          title: 'Withdrawing from vault',
          message: `Withdrawing ${amount} USDC...`,
          txHash: hash,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        addToast({
          type: 'success',
          title: 'Withdrawal confirmed',
          message: `${amount} USDC withdrawn from the vault.`,
          txHash: hash,
        });
      }

      setAmount('');
      await Promise.all([loadSummary(), loadAccountData(), loadActivity()]);
    } catch (err: any) {
      console.error('Vault action failed:', err);
      addToast({
        type: 'error',
        title: 'Transaction failed',
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  const canUseVault = VAULT_READY && chainId === CHAIN_ID_V2;

  return (
    <div className="panel lp-vault-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Liquidity provision</p>
          <h3>USDC Vault</h3>
        </div>
        <div className="vault-apy">
          <span className="label">APY</span>
          <span className="apy-value text-positive">
            {summary?.apy ? formatPct(summary.apy) : 'Coming soon'}
          </span>
        </div>
      </div>

      <div className="vault-stats">
        <div className="vault-stat-card">
          <span className="label">Total Value Locked</span>
          <strong>{formatCompact(summary?.totalAssets || 0)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Utilization</span>
          <strong>{formatPct(summary?.utilization || 0)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Your Deposit</span>
          <strong>{formatUsd(account?.assets || 0, 2)}</strong>
        </div>
        <div className="vault-stat-card">
          <span className="label">Your Share</span>
          <strong>{formatPct(((account?.shares || 0) / (summary?.totalSupply || 1)) * 100)}</strong>
        </div>
      </div>

      {isConnected ? (
        <div className="vault-actions">
          {!canUseVault && (
            <div className="vault-warning">
              <p className="muted small">Switch to Base and ensure vault addresses are configured to deposit.</p>
            </div>
          )}
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
                disabled={!canUseVault}
              />
              <button className="btn-max" onClick={() => setAmount(maxAmount.toString())}>
                MAX
              </button>
            </div>
            <p className="input-hint">
              Available: {formatNumber(maxAmount, 2)} USDC
            </p>
          </div>

          <button
            className="btn primary"
            onClick={handleSubmit}
            disabled={
              loading ||
              !amount ||
              Number(amount) <= 0 ||
              Number(amount) > maxAmount ||
              !canUseVault
            }
          >
            {loading
              ? 'Processing...'
              : mode === 'deposit'
              ? needsApproval
                ? 'Approve & Deposit'
                : 'Deposit to Vault'
              : 'Withdraw from Vault'}
          </button>

          {needsApproval && mode === 'deposit' && (
            <p className="muted small">Approval will be submitted before depositing.</p>
          )}
        </div>
      ) : (
        <p className="muted small">Connect wallet to deposit or withdraw.</p>
      )}

      <div className="vault-info">
        <p className="muted small">
          Deposit USDC to provide liquidity for perpetual traders. Earn fees from trading and funding. Withdrawals
          are processed immediately based on available vault liquidity.
        </p>
      </div>

      {activity.length > 0 && (
        <div className="vault-activity">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h4>Last movements</h4>
            </div>
          </div>
          <div className="vault-activity-head">
            <span>Type</span>
            <span>Amount</span>
            <span>Shares</span>
            <span>When</span>
          </div>
          {activity.map((item) => (
            <div key={`${item.type}-${item.id}-${item.createdAt}`} className="vault-activity-row">
              <span className={item.type === 'deposit' ? 'text-positive' : 'text-negative'}>
                {item.type.toUpperCase()}
              </span>
              <span>{formatUsd(item.amount, 2)}</span>
              <span>{formatNumber(item.shares, 4)}</span>
              <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '--'}</span>
            </div>
          ))}
        </div>
      )}
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

function computePrice(assetsRaw: bigint, supplyRaw: bigint) {
  if (supplyRaw === 0n) return 1;
  const scaled = (assetsRaw * ONE_E18) / supplyRaw;
  return Number(scaled) / 1_000_000;
}
