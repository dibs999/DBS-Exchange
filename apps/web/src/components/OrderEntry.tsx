import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, stringToHex } from 'viem';
import { ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY, MARKET_ID_STRING, ORDERBOOK_ABI, ORDERBOOK_ADDRESS, ORDERBOOK_READY } from '../contracts';
import { formatUsd } from '../lib/format';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';

export type OrderEntryProps = {
  marketId: string;
  markPrice: number;
  prefill?: { price: number; side: 'bid' | 'ask'; key: number } | null;
};

const orderTypes = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
] as const;

type OrderType = (typeof orderTypes)[number]['id'];

type Side = 'long' | 'short';

export default function OrderEntry({ marketId, markPrice, prefill }: OrderEntryProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState('5');
  const [trigger, setTrigger] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [operatorApproved, setOperatorApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Prefill from orderbook clicks (limit ticket UX)
  useEffect(() => {
    if (!prefill) return;
    setTrigger(prefill.price.toFixed(2));
    setSide(prefill.side === 'bid' ? 'long' : 'short');
    setOrderType((prev) => (prev === 'market' ? 'limit' : prev));
  }, [prefill?.key]);

  const marketIdHex = useMemo(() => stringToHex(marketId || MARKET_ID_STRING, { size: 32 }), [marketId]);
  const requiresTrigger = orderType !== 'market';
  const orderbookEnabled = ORDERBOOK_READY && ENGINE_READY;

  // Calculate estimated notional
  const estimatedNotional = useMemo(() => {
    const sizeNum = Number(size) || 0;
    return sizeNum * markPrice;
  }, [size, markPrice]);

  const estimatedMargin = useMemo(() => {
    const leverageNum = Number(leverage) || 1;
    return estimatedNotional / leverageNum;
  }, [estimatedNotional, leverage]);

  // Calculate price impact (simplified simulation)
  const priceImpact = useMemo(() => {
    const sizeNum = Number(size) || 0;
    if (sizeNum === 0) return 0;
    // Simplified price impact: larger orders have more impact
    // In a real implementation, this would use orderbook depth
    const impactBps = Math.min(sizeNum * 5, 100); // 0.05% per ETH, max 1%
    return impactBps / 100;
  }, [size]);

  const priceImpactWarning = priceImpact > 0.5; // Warn if > 0.5%

  function validateBeforeSubmit(): boolean {
    if (!walletClient || !publicClient || !address) return false;
    if (chainId !== 11155111) {
      addToast({ type: 'warning', title: 'Wrong network', message: 'Please switch to Sepolia before trading.' });
      return false;
    }
    if (!ENGINE_READY) {
      addToast({ type: 'error', title: 'Error', message: 'Engine not configured.' });
      return false;
    }
    if (!size || Number(size) <= 0) {
      addToast({ type: 'warning', title: 'Invalid input', message: 'Enter a valid size.' });
      return false;
    }
    const leverageValue = Number(leverage);
    if (!Number.isFinite(leverageValue) || leverageValue <= 0 || !Number.isInteger(leverageValue)) {
      addToast({ type: 'warning', title: 'Invalid input', message: 'Leverage must be a positive integer.' });
      return false;
    }
    if (requiresTrigger && (!trigger || Number(trigger) <= 0)) {
      addToast({ type: 'warning', title: 'Invalid input', message: 'Enter a trigger price.' });
      return false;
    }

    // Safety guard (MVP heuristic)
    if (orderType === 'market' && settings.slippageTolerancePct > 0 && priceImpact > settings.slippageTolerancePct) {
      addToast({
        type: 'warning',
        title: 'Safety guard',
        message: `Estimated impact (~${priceImpact.toFixed(2)}%) exceeds your tolerance (${settings.slippageTolerancePct.toFixed(
          2
        )}%). Reduce size or increase tolerance.`,
      });
      return false;
    }
    return true;
  }

  useEffect(() => {
    async function loadOperator() {
      if (!publicClient || !address || !ENGINE_READY || !ORDERBOOK_READY) {
        setOperatorApproved(false);
        return;
      }
      try {
        const approved = (await publicClient.readContract({
          address: ENGINE_ADDRESS,
          abi: ENGINE_ABI,
          functionName: 'isOperator',
          args: [address, ORDERBOOK_ADDRESS],
        })) as boolean;
        setOperatorApproved(approved);
      } catch {
        setOperatorApproved(false);
      }
    }
    loadOperator();
  }, [publicClient, address]);

  async function approveOperator() {
    if (!walletClient || !publicClient || !address) return;
    if (chainId !== 11155111) {
      addToast({ type: 'warning', title: 'Wrong network', message: 'Please switch to Sepolia.' });
      return;
    }
    if (!ORDERBOOK_READY) {
      addToast({ type: 'error', title: 'Error', message: 'Order router not configured.' });
      return;
    }
    setLoading(true);
    try {
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'setOperator',
        args: [ORDERBOOK_ADDRESS, true],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Approval submitted',
        message: 'Approving order router...',
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setOperatorApproved(true);
      addToast({
        type: 'success',
        title: 'Router approved',
        message: 'You can now place limit and stop orders.',
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

  async function submitOrder() {
    if (!validateBeforeSubmit()) return;
    if (!walletClient || !publicClient || !address) return;

    setLoading(true);
    try {
      const leverageValue = Number(leverage);
      const sizeUnits = parseUnits(size, 18);
      const signedSize = side === 'short' ? -sizeUnits : sizeUnits;

      if (orderType === 'market') {
        const { request } = await publicClient.simulateContract({
          address: ENGINE_ADDRESS,
          abi: ENGINE_ABI,
          functionName: 'openPosition',
          args: [marketIdHex, signedSize, BigInt(leverageValue)],
          account: address,
        });
        const hash = await walletClient.writeContract(request);
        addToast({
          type: 'info',
          title: 'Market order submitted',
          message: `Opening ${side} ${size} ETH at ${leverageValue}x...`,
          txHash: hash,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        addToast({
          type: 'success',
          title: 'Position opened!',
          message: `${side.toUpperCase()} ${size} ETH at ${leverageValue}x leverage.`,
        });
        setSize('');
        return;
      }

      if (!ORDERBOOK_READY) {
        addToast({ type: 'error', title: 'Error', message: 'Order router not configured.' });
        return;
      }
      if (!operatorApproved) {
        addToast({ type: 'warning', title: 'Action required', message: 'Approve the order router first.' });
        return;
      }

      const triggerUnits = parseUnits(trigger || '0', 18);
      const { request } = await publicClient.simulateContract({
        address: ORDERBOOK_ADDRESS,
        abi: ORDERBOOK_ABI,
        functionName: 'createOrder',
        args: [marketIdHex, signedSize, BigInt(leverageValue), triggerUnits, orderType === 'stop', reduceOnly],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: `${orderType} order submitted`,
        message: `Creating ${orderType} order...`,
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Order created!',
        message: `${orderType.charAt(0).toUpperCase() + orderType.slice(1)} order placed at ${formatUsd(Number(trigger), 2)}.`,
      });
      setSize('');
      setTrigger('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Order failed',
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmitClick() {
    if (!validateBeforeSubmit()) return;
    if (!settings.showConfirmations) {
      submitOrder();
      return;
    }
    setConfirmOpen(true);
  }

  const confirmDetails = useMemo(() => {
    const leverageValue = Number(leverage);
    const details: { label: string; value: string }[] = [
      { label: 'Market', value: marketId },
      { label: 'Type', value: orderType.toUpperCase() },
      { label: 'Side', value: side.toUpperCase() },
      { label: 'Size', value: `${size || '0'} ETH` },
      { label: 'Leverage', value: `${Number.isFinite(leverageValue) ? leverageValue : '--'}x` },
      { label: 'Est. Notional', value: formatUsd(estimatedNotional, 2) },
      { label: 'Est. Margin', value: formatUsd(estimatedMargin, 2) },
      { label: 'Est. Liq', value: formatUsd(markPrice * (side === 'long' ? 0.86 : 1.14), 2) },
      { label: 'Impact (est.)', value: `~${priceImpact.toFixed(2)}%` },
      { label: 'Tolerance', value: `${settings.slippageTolerancePct.toFixed(2)}%` },
    ];
    if (orderType !== 'market') {
      details.splice(3, 0, { label: 'Trigger', value: trigger ? formatUsd(Number(trigger), 2) : '--' });
      if (reduceOnly) details.splice(5, 0, { label: 'Reduce only', value: 'Yes' });
    }
    return details;
  }, [
    estimatedMargin,
    estimatedNotional,
    leverage,
    marketId,
    markPrice,
    orderType,
    priceImpact,
    reduceOnly,
    settings.slippageTolerancePct,
    side,
    size,
    trigger,
  ]);

  return (
    <div className="panel order-entry-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order ticket</p>
          <h3>Place a trade</h3>
        </div>
        <div className="status">{chainId !== 11155111 ? 'Sepolia only' : `Mark ${formatUsd(markPrice, 2)}`}</div>
      </div>
      
      {orderType !== 'market' && !orderbookEnabled ? (
        <div className="status warn">Order router not configured.</div>
      ) : null}

      <div className="order-tabs">
        {orderTypes.map((item) => (
          <button key={item.id} className={orderType === item.id ? 'active' : ''} onClick={() => setOrderType(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="order-grid">
        <label>
          Size (ETH)
          <input 
            value={size} 
            onChange={(e) => setSize(e.target.value)} 
            placeholder="0.5" 
            type="number"
            step="0.01"
          />
        </label>
        <label>
          Leverage
          <input 
            value={leverage} 
            onChange={(e) => setLeverage(e.target.value)} 
            placeholder="5"
            type="number"
            min="1"
            max="50"
          />
        </label>
        {requiresTrigger ? (
          <label>
            Trigger price
            <input 
              value={trigger} 
              onChange={(e) => setTrigger(e.target.value)} 
              placeholder={markPrice.toFixed(2)}
              type="number"
              step="0.01"
            />
          </label>
        ) : null}
      </div>

      {/* Order Preview */}
      {Number(size) > 0 && (
        <div className="order-preview">
          <div className="preview-row">
            <span className="label">Est. Notional</span>
            <span>{formatUsd(estimatedNotional, 2)}</span>
          </div>
          <div className="preview-row">
            <span className="label">Est. Margin</span>
            <span>{formatUsd(estimatedMargin, 2)}</span>
          </div>
          <div className="preview-row">
            <span className="label">Est. Liq. Price</span>
            <span className="text-negative">
              {formatUsd(markPrice * (side === 'long' ? 0.86 : 1.14), 2)}
            </span>
          </div>
          <div className="preview-row">
            <span className="label">Price Impact</span>
            <span className={priceImpactWarning ? 'text-negative' : 'text-positive'}>
              ~{priceImpact.toFixed(2)}%
            </span>
          </div>
          {priceImpactWarning && (
            <div className="price-impact-warning">
              ⚠️ High price impact. Consider reducing order size.
            </div>
          )}
        </div>
      )}

      <div className="order-actions">
        <div className="segmented">
          <button className={side === 'long' ? 'active long' : ''} onClick={() => setSide('long')}>
            Long
          </button>
          <button className={side === 'short' ? 'active short' : ''} onClick={() => setSide('short')}>
            Short
          </button>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce only
        </label>
      </div>

      {orderType !== 'market' ? (
        <button className="btn ghost" onClick={approveOperator} disabled={operatorApproved || !isConnected || loading}>
          {operatorApproved ? '✓ Router approved' : loading ? 'Approving...' : 'Approve router'}
        </button>
      ) : null}

      <button 
        className={`btn ${side === 'long' ? 'btn-long' : 'btn-short'}`} 
        onClick={handleSubmitClick} 
        disabled={!isConnected || chainId !== 11155111 || (orderType !== 'market' && !ORDERBOOK_READY) || loading}
      >
        {loading ? 'Processing...' : `${side === 'long' ? 'Long' : 'Short'} ${marketId}`}
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Confirm transaction"
        message="Please confirm the order details below. This will submit an on-chain transaction."
        confirmText="Submit order"
        cancelText="Cancel"
        variant={priceImpactWarning ? 'warning' : 'info'}
        details={confirmDetails}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          submitOrder();
        }}
      />
    </div>
  );
}
