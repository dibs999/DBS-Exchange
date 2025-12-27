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
  availableMargin?: number; // For quick size calculation
};

const orderTypes = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
] as const;

const QUICK_SIZE_PERCENTAGES = [25, 50, 75, 100];

type OrderType = (typeof orderTypes)[number]['id'];
type OrderMode = 'continuous' | 'batch';
type Side = 'long' | 'short';

export default function OrderEntryV2({ marketId, markPrice, prefill, availableMargin = 1000 }: OrderEntryV2Props) {
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

  // Advanced Order Params
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prefill from orderbook clicks
  useEffect(() => {
    if (!prefill) return;
    setTrigger(prefill.price.toFixed(2));
    setSide(prefill.side === 'bid' ? 'long' : 'short');
    setOrderType((prev: OrderType) => (prev === 'market' ? 'limit' : prev));
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

  // Calculate price impact (simplified)
  const priceImpact = useMemo(() => {
    const sizeNum = Number(size) || 0;
    if (sizeNum === 0) return 0;
    const impactBps = Math.min(sizeNum * 5, 100);
    return impactBps / 100;
  }, [size]);

  const priceImpactWarning = priceImpact > Number(slippageTolerance || 0);

  // Quick Size Calculation
  function handleQuickSize(percentage: number) {
    // Calculate size based on available margin and leverage (simplified: 10x default)
    const leverage = 10;
    const maxNotional = availableMargin * leverage;
    const targetNotional = (maxNotional * percentage) / 100;
    const targetSize = markPrice > 0 ? targetNotional / markPrice : 0;
    setSize(targetSize.toFixed(4));
  }

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
    if (takeProfit && Number(takeProfit) <= 0) {
      addToast({ type: 'warning', title: 'Invalid TP', message: 'Take Profit price must be positive.' });
      return false;
    }
    if (stopLoss && Number(stopLoss) <= 0) {
      addToast({ type: 'warning', title: 'Invalid SL', message: 'Stop Loss price must be positive.' });
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
      const slippageBps = Math.floor(Number(slippageTolerance || 0.5) * 100);

      const txs: { name: string; request: any }[] = [];

      // Main Order
      const { request: mainRequest } = await publicClient.simulateContract({
        address: ORDERBOOK_V2_ADDRESS,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'placeOrder',
        args: [marketIdHex, signedSize, priceUnits, mode, type, triggerPrice, slippageBps],
        account: address,
      });
      txs.push({ name: 'Main Order', request: mainRequest });

      // TP Order (if set)
      if (takeProfit) {
        const tpPriceWei = parseUnits(takeProfit, 18);
        const tpSize = -signedSize;
        const { request: tpRequest } = await publicClient.simulateContract({
          address: ORDERBOOK_V2_ADDRESS,
          abi: ORDERBOOK_V2_ABI,
          functionName: 'placeOrder',
          args: [marketIdHex, tpSize, tpPriceWei, 0, 1, 0n, 0],
          account: address,
        });
        txs.push({ name: 'Take Profit', request: tpRequest });
      }

      // SL Order (if set)
      if (stopLoss) {
        const slTriggerWei = parseUnits(stopLoss, 18);
        const slSize = -signedSize;
        const { request: slRequest } = await publicClient.simulateContract({
          address: ORDERBOOK_V2_ADDRESS,
          abi: ORDERBOOK_V2_ABI,
          functionName: 'placeOrder',
          args: [marketIdHex, slSize, 0n, 0, 2, slTriggerWei, 0],
          account: address,
        });
        txs.push({ name: 'Stop Loss', request: slRequest });
      }

      // Execute transactions sequentially
      for (const tx of txs) {
        const hash = await walletClient.writeContract(tx.request);
        addToast({
          type: 'info',
          title: `Submitting ${tx.name}`,
          message: 'Waiting for confirmation...',
          txHash: hash,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      addToast({
        type: 'success',
        title: 'Order(s) placed!',
        message: `Successfully submitted ${txs.length} order(s).`,
      });

      // Cleanup
      setSize('');
      setTrigger('');
      setTakeProfit('');
      setStopLoss('');
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
    // One-Click Mode: Skip confirmations
    if (settings.oneClickMode || !settings.showConfirmations) {
      submitOrder();
      return;
    }
    setConfirmOpen(true);
  }

  // One-Click Mode: Auto-submit when side changes (if size is set)
  function handleSideChange(newSide: Side) {
    setSide(newSide);

    // In One-Click Mode with default size, submit immediately
    if (settings.oneClickMode && settings.defaultOrderSize && !size) {
      setSize(settings.defaultOrderSize);
      // Use setTimeout to let state update
      setTimeout(() => {
        if (isConnected && chainId === CHAIN_ID_V2) {
          submitOrder();
        }
      }, 100);
    }
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
    if (takeProfit) {
      details.push({ label: 'Take Profit', value: formatUsd(Number(takeProfit), 2) });
    }
    if (stopLoss) {
      details.push({ label: 'Stop Loss', value: formatUsd(Number(stopLoss), 2) });
    }
    return details;
  }, [estimatedNotional, estimatedFee, marketId, orderType, orderMode, priceImpact, side, size, trigger, slippageTolerance, takeProfit, stopLoss]);

  return (
    <div className="panel order-entry-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order ticket (V2)</p>
          <h3>Place a trade</h3>
        </div>
        <div className="status">
          {settings.oneClickMode && <span className="chip warning" style={{ marginRight: 8 }}>⚡ One-Click</span>}
          {chainId !== CHAIN_ID_V2 ? `Switch to ${CHAIN_ID_V2 === 8453 ? 'Base' : 'Network'}` : `Mark ${formatUsd(markPrice, 2)}`}
        </div>
      </div>

      {!orderbookEnabled && (
        <div className="status warn">V2 Orderbook not configured.</div>
      )}

      <div className="order-tabs">
        {orderTypes.map((item) => (
          <button
            key={item.id}
            className={orderType === item.id ? 'active' : ''}
            onClick={() => {
              setOrderType(item.id);
              if (item.id === 'market') {
                setOrderMode('continuous');
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSize(e.target.value)}
            placeholder="0.5"
            type="number"
            step="0.01"
          />
        </label>

        {/* Quick Size Buttons */}
        <div className="quick-size-buttons" style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {QUICK_SIZE_PERCENTAGES.map(pct => (
            <button
              key={pct}
              type="button"
              className="btn ghost small"
              onClick={() => handleQuickSize(pct)}
              style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
            >
              {pct}%
            </button>
          ))}
        </div>

        {requiresTrigger && (
          <label>
            {orderType === 'stop' ? 'Trigger price' : 'Limit price'}
            <input
              value={trigger}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTrigger(e.target.value)}
              placeholder={markPrice.toFixed(2)}
              type="number"
              step="0.01"
            />
          </label>
        )}
      </div>

      {/* Advanced Options (TP/SL & Slippage) */}
      <div className="advanced-options" style={{ marginTop: 8 }}>
        <button
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          type="button"
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}
        >
          {showAdvanced ? '▼' : '▶'} Advanced: TP/SL & Slippage
        </button>

        {showAdvanced && (
          <div className="advanced-content" style={{ marginTop: 8, padding: 8, background: '#111', borderRadius: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                Take Profit
                <input
                  value={takeProfit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                  type="number"
                  step="0.01"
                />
              </label>
              <label>
                Stop Loss
                <input
                  value={stopLoss}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                  type="number"
                  step="0.01"
                />
              </label>
            </div>
            <label style={{ display: 'block', marginTop: 8 }}>
              Slippage Tolerance (%)
              <input
                value={slippageTolerance}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlippageTolerance(e.target.value)}
                placeholder="0.5"
                type="number"
                step="0.1"
                min="0"
                max="10"
              />
            </label>
            {(takeProfit || stopLoss) && (
              <p className="small text-warning" style={{ marginTop: 8, color: '#f59e0b' }}>
                ⚠️ Using TP/SL requires signing multiple independent transactions.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Order Preview */}
      {Number(size) > 0 && (
        <div className="order-preview" style={{ marginTop: 12, padding: 8, background: '#0a0a0a', borderRadius: 4 }}>
          <div className="preview-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="label" style={{ color: '#888' }}>Est. Notional</span>
            <span>{formatUsd(estimatedNotional, 2)}</span>
          </div>
          {estimatedFee > 0 && (
            <div className="preview-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label" style={{ color: '#888' }}>Est. Fee</span>
              <span>{formatUsd(estimatedFee, 2)}</span>
            </div>
          )}
          <div className="preview-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="label" style={{ color: '#888' }}>Price Impact</span>
            <span className={priceImpactWarning ? 'text-negative' : 'text-positive'}>
              ~{priceImpact.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Side Selection */}
      <div className="order-actions" style={{ marginTop: 12 }}>
        <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            className={side === 'long' ? 'active long btn btn-long' : 'btn ghost'}
            onClick={() => handleSideChange('long')}
            style={{ padding: 12 }}
          >
            Long
          </button>
          <button
            className={side === 'short' ? 'active short btn btn-short' : 'btn ghost'}
            onClick={() => handleSideChange('short')}
            style={{ padding: 12 }}
          >
            Short
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        className={`btn ${side === 'long' ? 'btn-long' : 'btn-short'}`}
        onClick={handleSubmitClick}
        disabled={!isConnected || chainId !== CHAIN_ID_V2 || !ORDERBOOK_V2_READY || loading || !size}
        style={{ width: '100%', marginTop: 12, padding: 14, fontWeight: 'bold' }}
      >
        {loading ? 'Processing...' : `${side === 'long' ? '🟢 Long' : '🔴 Short'} ${marketId}`}
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
