import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, stringToHex } from 'viem';
import { ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY, MARKET_ID_STRING, ORDERBOOK_ABI, ORDERBOOK_ADDRESS, ORDERBOOK_READY } from '../contracts';
import { formatUsd } from '../lib/format';

export type OrderEntryProps = {
  marketId: string;
  markPrice: number;
};

const orderTypes = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
] as const;

type OrderType = (typeof orderTypes)[number]['id'];

type Side = 'long' | 'short';

export default function OrderEntry({ marketId, markPrice }: OrderEntryProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [leverage, setLeverage] = useState('5');
  const [trigger, setTrigger] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [operatorApproved, setOperatorApproved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const marketIdHex = useMemo(() => stringToHex(marketId || MARKET_ID_STRING, { size: 32 }), [marketId]);
  const requiresTrigger = orderType !== 'market';
  const orderbookEnabled = ORDERBOOK_READY && ENGINE_READY;

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
    if (!ORDERBOOK_READY) {
      setStatus('Order router not configured.');
      return;
    }
    try {
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'setOperator',
        args: [ORDERBOOK_ADDRESS, true],
        account: address,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Operator approved: ${hash}`);
      setOperatorApproved(true);
    } catch (err: any) {
      setStatus(err?.message || 'Operator approval failed');
    }
  }

  async function submitOrder() {
    if (!walletClient || !publicClient || !address) return;
    if (!ENGINE_READY) {
      setStatus('Engine not configured.');
      return;
    }
    if (!size || Number(size) <= 0) {
      setStatus('Enter a valid size.');
      return;
    }
    const leverageValue = Number(leverage);
    if (!Number.isFinite(leverageValue) || leverageValue <= 0 || !Number.isInteger(leverageValue)) {
      setStatus('Leverage must be an integer.');
      return;
    }

    if (requiresTrigger && (!trigger || Number(trigger) <= 0)) {
      setStatus('Enter a trigger price.');
      return;
    }

    try {
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
        setStatus(`Market order sent: ${hash}`);
        return;
      }

      if (!ORDERBOOK_READY) {
        setStatus('Order router not configured.');
        return;
      }
      if (!operatorApproved) {
        setStatus('Approve the order router first.');
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
      setStatus(`Order submitted: ${hash}`);
    } catch (err: any) {
      setStatus(err?.message || 'Order failed');
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Order ticket</p>
          <h3>Place a trade</h3>
        </div>
        <div className="status">{chainId !== 11155111 ? 'Sepolia only' : `Mark ${formatUsd(markPrice, 2)}`}</div>
      </div>
      {orderType !== 'market' && !orderbookEnabled ? <div className="status warn">Order router not configured.</div> : null}

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
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="0.5" />
        </label>
        <label>
          Leverage
          <input value={leverage} onChange={(e) => setLeverage(e.target.value)} placeholder="5" />
        </label>
        {requiresTrigger ? (
          <label>
            Trigger price
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder={markPrice.toFixed(2)} />
          </label>
        ) : null}
      </div>

      <div className="order-actions">
        <div className="segmented">
          <button className={side === 'long' ? 'active' : ''} onClick={() => setSide('long')}>
            Long
          </button>
          <button className={side === 'short' ? 'active' : ''} onClick={() => setSide('short')}>
            Short
          </button>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce only
        </label>
      </div>

      {orderType !== 'market' ? (
        <button className="btn ghost" onClick={approveOperator} disabled={operatorApproved || !isConnected}>
          {operatorApproved ? 'Router approved' : 'Approve router'}
        </button>
      ) : null}

      <button className="btn primary" onClick={submitOrder} disabled={!isConnected || (orderType !== 'market' && !ORDERBOOK_READY)}>
        Submit order
      </button>

      {status ? <div className="status">{status}</div> : null}
    </div>
  );
}
