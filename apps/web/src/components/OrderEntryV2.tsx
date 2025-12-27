import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, stringToHex } from 'viem';
import {
  ENGINE_V2_ADDRESS,
  ENGINE_V2_READY,
  MARKET_ID_V2,
  MARKET_ID_V2_STRING,
  ORDERBOOK_V2_ABI,
  ORDERBOOK_V2_ADDRESS,
  ORDERBOOK_V2_READY,
  PERP_ENGINE_V2_ABI,
  CHAIN_ID_V2,
} from '../contracts-v2';
import { formatUsd } from '../lib/format';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';

export type OrderEntryV2Props = {
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
type OrderMode = 'continuous' | 'batch';
type Side = 'long' | 'short';

export default function OrderEntryV2({ marketId, markPrice, prefill }: OrderEntryV2Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [orderMode, setOrderMode] = useState<OrderMode>('continuous');
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [trigger, setTrigger] = useState('');
  const [slippageTolerance, setSlippageTolerance] = useState('0.5');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [makerFeeBps, setMakerFeeBps] = useState<number | null>(null);
  const [takerFeeBps, setTakerFeeBps] = useState<number | null>(null);

  // Prefill from orderbook clicks
  useEffect(() => {
    if (!prefill) return;
    setTrigger(prefill.price.toFixed(2));
    setSide(prefill.side === 'bid' ? 'long' : 'short');
    setOrderType((prev) => (prev === 'market' ? 'limit' : prev));
  }, [prefill?.key]);

  const marketIdHex = useMemo(() => stringToHex(marketId || MARKET_ID_V2_STRING, { size: 32 }), [marketId]);
  const requiresTrigger = orderType !== 'market';
  const orderbookEnabled = ORDERBOOK_V2_READY && ENGINE_V2_READY;

  // Load fees from contract
  useEffect(() => {
    async function loadFees() {
      if (!publicClient || !ORDERBOOK_V2_READY) {
        setMakerFeeBps(null);
        setTakerFeeBps(null);
        return;
      }
      try {
        const [makerFee, takerFee] = await Promise.all([
          publicClient.readContract({
            address: ORDERBOOK_V2_ADDRESS,
            abi: ORDERBOOK_V2_ABI,
            functionName: 'makerFeeBps',
          }),
          publicClient.readContract({
            address: ORDERBOOK_V2_ADDRESS,
            abi: ORDERBOOK_V2_ABI,
            functionName: 'takerFeeBps',
          }),
        ]);
        setMakerFeeBps(Number(makerFee));
        setTakerFeeBps(Number(takerFee));
      } catch {
        setMakerFeeBps(null);
        setTakerFeeBps(null);
      }
    }
    loadFees();
  }, [publicClient]);

  // Calculate estimated notional
  const estimatedNotional = useMemo(() => {
    const sizeNum = Number(size) || 0;
    const price = orderType === 'market' ? markPrice : Number(trigger) || markPrice;
    return sizeNum * price;
  }, [size, markPrice, trigger, orderType]);

  // Calculate estimated fees
  const estimatedFee = useMemo(() => {
    if (!estimatedNotional) return 0;
    const feeBps = orderType === 'market' ? takerFeeBps : orderMode === 'continuous' ? takerFeeBps : makerFeeBps;
    if (!feeBps) return 0;
    return (estimatedNotional * feeBps) / 10000;
  }, [estimatedNotional, orderType, orderMode, makerFeeBps, takerFeeBps]);

  // Calculate price impact
  const priceImpact = useMemo(() => {
    const sizeNum = Number(size) || 0;
    if (sizeNum === 0) return 0;
    const impactBps = Math.min(sizeNum * 5, 100);
    return impactBps / 100;
  }, [size]);

  const priceImpactWarning = priceImpact > Number(slippageTolerance || 0);

  function validateBeforeSubmit(): boolean {
    if (!walletClient || !publicClient || !address) return false;
    if (chainId !== CHAIN_ID_V2) {
      addToast({ type: 'warning', title: 'Wrong network', message: `Please switch to ${CHAIN_ID_V2 === 8453 ? 'Base' : 'Network'} before trading.` });
      return false;
    }
    if (!ENGINE_V2_READY) {
      addToast({ type: 'error', title: 'Error', message: 'Engine V2 not configured.' });
      return false;
    }
    if (!size || Number(size) <= 0) {
      addToast({ type: 'warning', title: 'Invalid input', message: 'Enter a valid size.' });
      return false;
    }
    if (orderType === 'market' && orderMode !== 'continuous') {
      addToast({ type: 'warning', title: 'Invalid mode', message: 'Market orders must be continuous.' });
      return false;
    }
    if (requiresTrigger && (!trigger || Number(trigger) <= 0)) {
      addToast({ type: 'warning', title: 'Invalid input', message: 'Enter a trigger price.' });
      return false;
    }
    if (priceImpactWarning) {
      addToast({
        type: 'warning',
        title: 'High price impact',
        message: `Estimated impact (~${priceImpact.toFixed(2)}%) exceeds your tolerance (${slippageTolerance}%).`,
      });
      return false;
    }
    return true;
  }

  async function submitOrder() {
    if (!validateBeforeSubmit()) return;
    if (!walletClient || !publicClient || !address) return;

    setLoading(true);
    try {
      const sizeUnits = parseUnits(size, 18);
      const signedSize = side === 'short' ? -sizeUnits : sizeUnits;
      const priceUnits = trigger ? parseUnits(trigger, 18) : 0n;
      const mode = orderMode === 'continuous' ? 0 : 1;
      const type = orderType === 'market' ? 0 : orderType === 'limit' ? 1 : 2;
      const triggerPrice = orderType === 'stop' ? priceUnits : 0n;
      
      // Calculate max slippage in basis points (default 1% = 100 bps)
      const slippageBps = Math.floor(Number(slippageTolerance || 0.5) * 100);

      const { request } = await publicClient.simulateContract({
        address: ORDERBOOK_V2_ADDRESS,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'placeOrder',
        args: [marketIdHex, signedSize, priceUnits, mode, type, triggerPrice, slippageBps],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: `${orderType} order submitted`,
        message: `Creating ${orderType} ${orderMode} order...`,
        txHash: hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Order created!',
        message: `${orderType.charAt(0).toUpperCase() + orderType.slice(1)} order placed.`,
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
    const details: { label: string; value: string }[] = [
      { label: 'Market', value: marketId },
      { label: 'Type', value: orderType.toUpperCase() },
      { label: 'Mode', value: orderMode.toUpperCase() },
      { label: 'Side', value: side.toUpperCase() },
      { label: 'Size', value: `${size || '0'} ETH` },
      { label: 'Est. Notional', value: formatUsd(estimatedNotional, 2) },
      { label: 'Est. Fee', value: formatUsd(estimatedFee, 2) },
      { label: 'Impact (est.)', value: `~${priceImpact.toFixed(2)}%` },
      { label: 'Slippage Tolerance', value: `${slippageTolerance}%` },
    ];
    if (orderType !== 'market') {
      details.splice(5, 0, { label: 'Price', value: trigger ? formatUsd(Number(trigger), 2) : '--' });
    }
    if (makerFeeBps !== null && takerFeeBps !== null) {
      const feeBps = orderType === 'market' ? takerFeeBps : orderMode === 'continuous' ? takerFeeBps : makerFeeBps;
      details.push({ label: 'Fee Rate', value: `${(feeBps / 100).toFixed(2)}%` });
    }
    return details;
  }, [estimatedNotional, estimatedFee, marketId, orderType, orderMode, priceImpact, side, size, trigger, slippageTolerance, makerFeeBps, takerFeeBps]);

  return (
    <div className="panel order-entry-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order ticket (V2)</p>
          <h3>Place a trade</h3>
        </div>
        <div className="status">{chainId !== CHAIN_ID_V2 ? `Switch to ${CHAIN_ID_V2 === 8453 ? 'Base' : 'Network'}` : `Mark ${formatUsd(markPrice, 2)}`}</div>
      </div>

      {!orderbookEnabled ? (
        <div className="status warn">V2 Orderbook not configured.</div>
      ) : null}

      <div className="order-tabs">
        {orderTypes.map((item) => (
          <button
            key={item.id}
            className={orderType === item.id ? 'active' : ''}
            onClick={() => {
              setOrderType(item.id);
              if (item.id === 'market') {
                setOrderMode('continuous'); // Market orders must be continuous
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {orderType !== 'market' && (
        <div className="order-mode-toggle">
          <label>Order Mode:</label>
          <div className="segmented">
            <button
              className={orderMode === 'continuous' ? 'active' : ''}
              onClick={() => setOrderMode('continuous')}
            >
              Continuous
            </button>
            <button
              className={orderMode === 'batch' ? 'active' : ''}
              onClick={() => setOrderMode('batch')}
            >
              Batch Auction
            </button>
          </div>
        </div>
      )}

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
        {requiresTrigger ? (
          <label>
            {orderType === 'stop' ? 'Trigger price' : 'Limit price'}
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder={markPrice.toFixed(2)}
              type="number"
              step="0.01"
            />
          </label>
        ) : null}
        <label>
          Slippage Tolerance (%)
          <input
            value={slippageTolerance}
            onChange={(e) => setSlippageTolerance(e.target.value)}
            placeholder="0.5"
            type="number"
            step="0.1"
            min="0"
            max="10"
          />
        </label>
      </div>

      {/* Order Preview */}
      {Number(size) > 0 && (
        <div className="order-preview">
          <div className="preview-row">
            <span className="label">Est. Notional</span>
            <span>{formatUsd(estimatedNotional, 2)}</span>
          </div>
          {estimatedFee > 0 && (
            <div className="preview-row">
              <span className="label">Est. Fee ({orderType === 'market' ? 'Taker' : orderMode === 'continuous' ? 'Taker' : 'Maker'})</span>
              <span>{formatUsd(estimatedFee, 2)}</span>
            </div>
          )}
          <div className="preview-row">
            <span className="label">Price Impact</span>
            <span className={priceImpactWarning ? 'text-negative' : 'text-positive'}>
              ~{priceImpact.toFixed(2)}%
            </span>
          </div>
          {makerFeeBps !== null && takerFeeBps !== null && (
            <div className="preview-row">
              <span className="label">Fee Rates</span>
              <span>Maker: {(makerFeeBps / 100).toFixed(2)}% | Taker: {(takerFeeBps / 100).toFixed(2)}%</span>
            </div>
          )}
          {priceImpactWarning && (
            <div className="price-impact-warning">
              ⚠️ High price impact. Consider reducing order size or increasing slippage tolerance.
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
      </div>

      <button
        className={`btn ${side === 'long' ? 'btn-long' : 'btn-short'}`}
        onClick={handleSubmitClick}
        disabled={!isConnected || chainId !== CHAIN_ID_V2 || !ORDERBOOK_V2_READY || loading}
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

