import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatUnits, maxUint256, parseUnits } from 'viem';
import { COLLATERAL_ABI, COLLATERAL_ADDRESS, ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY, MARKET_ID } from '../contracts';
import { formatNumber, formatUsd } from '../lib/format';

export default function PerpsCard() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect({ connector: injected() });
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [leverage, setLeverage] = useState('5');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [status, setStatus] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState('0');
  const [freeCollateral, setFreeCollateral] = useState('0');
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [position, setPosition] = useState<{ size: string; entry: string; margin: string } | null>(null);

  const needsSetup = useMemo(() => !ENGINE_READY, []);

  async function refreshBalances() {
    if (!publicClient || !address || needsSetup) return;
    try {
      const [walletBal, freeBal, allowanceRes, positionRes] = await Promise.all([
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
        publicClient.readContract({
          address: COLLATERAL_ADDRESS,
          abi: COLLATERAL_ABI,
          functionName: 'allowance',
          args: [address, ENGINE_ADDRESS],
        }),
        publicClient.readContract({
          address: ENGINE_ADDRESS,
          abi: ENGINE_ABI,
          functionName: 'getPosition',
          args: [address, MARKET_ID],
        }),
      ]);

      setWalletBalance(formatUnits(walletBal as bigint, 18));
      setFreeCollateral(formatUnits(freeBal as bigint, 18));
      setAllowance(allowanceRes as bigint);

      const tuple = positionRes as { size: bigint; entryPrice: bigint; margin: bigint };
      if (tuple.size === 0n) {
        setPosition(null);
      } else {
        setPosition({
          size: formatUnits(tuple.size < 0n ? -tuple.size : tuple.size, 18),
          entry: formatUnits(tuple.entryPrice, 18),
          margin: formatUnits(tuple.margin, 18),
        });
      }
    } catch (err: any) {
      setStatus(err?.message || 'Failed to sync balances');
    }
  }

  useEffect(() => {
    if (isConnected) refreshBalances();
  }, [isConnected, address]);

  async function handleConnect() {
    try {
      await connectAsync();
      setStatus(null);
    } catch (err: any) {
      setStatus(err?.message || 'Wallet connection failed');
    }
  }

  async function approveCollateral() {
    if (!walletClient || !publicClient || !address) return;
    try {
      const { request } = await publicClient.simulateContract({
        address: COLLATERAL_ADDRESS,
        abi: COLLATERAL_ABI,
        functionName: 'approve',
        args: [ENGINE_ADDRESS, maxUint256],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Approval sent: ${hash}`);
      await refreshBalances();
    } catch (err: any) {
      setStatus(err?.message || 'Approval failed');
    }
  }

  async function deposit() {
    if (!walletClient || !publicClient || !address) return;
    try {
      if (!depositAmount || Number(depositAmount) <= 0) {
        setStatus('Enter a valid deposit.');
        return;
      }
      const amount = parseUnits(depositAmount, 18);
      if (allowance < amount) {
        setStatus('Approve collateral first.');
        return;
      }
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'deposit',
        args: [amount],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Deposit submitted: ${hash}`);
      await refreshBalances();
    } catch (err: any) {
      setStatus(err?.message || 'Deposit failed');
    }
  }

  async function withdraw() {
    if (!walletClient || !publicClient || !address) return;
    try {
      if (!withdrawAmount || Number(withdrawAmount) <= 0) {
        setStatus('Enter a valid withdraw amount.');
        return;
      }
      const amount = parseUnits(withdrawAmount, 18);
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'withdraw',
        args: [amount],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Withdraw submitted: ${hash}`);
      await refreshBalances();
    } catch (err: any) {
      setStatus(err?.message || 'Withdraw failed');
    }
  }

  async function openPosition() {
    if (!walletClient || !publicClient || !address) return;
    try {
      if (!sizeInput || Number(sizeInput) <= 0) {
        setStatus('Enter a valid size.');
        return;
      }
      const leverageValue = Number(leverage);
      if (!Number.isFinite(leverageValue) || leverageValue <= 0 || !Number.isInteger(leverageValue)) {
        setStatus('Leverage must be an integer.');
        return;
      }
      const size = parseUnits(sizeInput, 18);
      const signedSize = side === 'short' ? -size : size;
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'openPosition',
        args: [MARKET_ID, signedSize, BigInt(leverageValue)],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Position sent: ${hash}`);
      await refreshBalances();
    } catch (err: any) {
      setStatus(err?.message || 'Position failed');
    }
  }

  async function closePosition() {
    if (!walletClient || !publicClient || !address) return;
    try {
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'closePosition',
        args: [MARKET_ID],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Close sent: ${hash}`);
      await refreshBalances();
    } catch (err: any) {
      setStatus(err?.message || 'Close failed');
    }
  }

  return (
    <div className="panel perps-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Perps Engine</p>
          <h3>On-chain positions</h3>
        </div>
        {isConnected ? (
          <button className="btn ghost" onClick={() => disconnect()}>
            Disconnect
          </button>
        ) : (
          <button className="btn primary" onClick={handleConnect}>
            Connect Wallet
          </button>
        )}
      </div>

      {needsSetup ? (
        <div className="status warn">Contracts are not configured. Add VITE_ENGINE_ADDRESS, VITE_COLLATERAL_ADDRESS, VITE_ORACLE_ADDRESS.</div>
      ) : null}
      {chainId && chainId !== 11155111 ? <div className="status warn">Switch to Sepolia to trade.</div> : null}

      <div className="stat-grid">
        <div>
          <p className="label">Wallet balance</p>
          <strong>{formatNumber(Number(walletBalance), 4)} oUSD</strong>
        </div>
        <div>
          <p className="label">Free collateral</p>
          <strong>{formatNumber(Number(freeCollateral), 4)} oUSD</strong>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Deposit oUSD
          <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="250" />
        </label>
        <label>
          Withdraw oUSD
          <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="100" />
        </label>
        <div className="action-row">
          <button className="btn secondary" onClick={approveCollateral}>
            Approve
          </button>
          <button className="btn primary" onClick={deposit}>
            Deposit
          </button>
          <button className="btn ghost" onClick={withdraw}>
            Withdraw
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Position size (ETH)
          <input value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} placeholder="0.35" />
        </label>
        <label>
          Leverage
          <input value={leverage} onChange={(e) => setLeverage(e.target.value)} placeholder="5" />
        </label>
        <div className="segmented">
          <button className={side === 'long' ? 'active' : ''} onClick={() => setSide('long')}>
            Long
          </button>
          <button className={side === 'short' ? 'active' : ''} onClick={() => setSide('short')}>
            Short
          </button>
        </div>
        <div className="action-row">
          <button className="btn primary" onClick={openPosition}>
            Open Position
          </button>
          <button className="btn ghost" onClick={closePosition}>
            Close
          </button>
        </div>
      </div>

      {position ? (
        <div className="position-summary">
          <div>
            <p className="label">Entry</p>
            <strong>{formatUsd(Number(position.entry))}</strong>
          </div>
          <div>
            <p className="label">Size</p>
            <strong>{formatNumber(Number(position.size), 4)} ETH</strong>
          </div>
          <div>
            <p className="label">Margin</p>
            <strong>{formatNumber(Number(position.margin), 4)} oUSD</strong>
          </div>
        </div>
      ) : (
        <p className="muted small">No open on-chain position yet.</p>
      )}

      {status ? <div className="status">{status}</div> : null}
    </div>
  );
}
