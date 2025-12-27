import React, { useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { Order } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';
import { ORDERBOOK_V2_ABI, ORDERBOOK_V2_ADDRESS, ORDERBOOK_V2_READY, CHAIN_ID_V2 } from '../contracts-v2';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';

export default function OpenOrdersV2({ data }: { data: Order[] }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);

  async function cancelOrderNow(order: Order) {
    if (!walletClient || !publicClient || !address || !ORDERBOOK_V2_READY) return;
    if (chainId !== CHAIN_ID_V2) {
      addToast({ type: 'warning', title: 'Wrong network', message: 'Switch to Base to cancel orders.' });
      return;
    }

    setCancellingId(order.id);
    try {
      const { request } = await publicClient.simulateContract({
        address: ORDERBOOK_V2_ADDRESS,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'cancelOrder',
        args: [BigInt(order.id)],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Cancelling order',
        message: `Cancelling order #${order.id.slice(-6)}...`,
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Order cancelled',
        message: `Order #${order.id.slice(-6)} has been cancelled.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to cancel order',
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setCancellingId(null);
    }
  }

  function handleCancelOrder(order: Order) {
    if (!settings.showConfirmations) {
      cancelOrderNow(order);
      return;
    }
    setConfirmOrder(order);
  }

  const openOrders = data.filter((order) => order.status === 'open');
  const recentOrders = data.filter((order) => order.status !== 'open').slice(0, 5);

  return (
    <div className="panel open-orders-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Orders (V2)</p>
          <h3>Open & recent</h3>
        </div>
        <button className="chip ghost">Live</button>
      </div>

      {openOrders.length > 0 && (
        <>
          <p className="muted small" style={{ marginBottom: 8 }}>Open Orders</p>
          <div className="orders-head">
            <span>ID</span>
            <span>Type</span>
            <span>Side</span>
            <span>Size</span>
            <span>Trigger</span>
            <span></span>
          </div>
          {openOrders.map((order) => (
            <div key={order.id} className="orders-row">
              <span>#{order.id.slice(-6)}</span>
              <span className="order-type-badge">{order.type}</span>
              <span className={order.side === 'buy' ? 'text-positive' : 'text-negative'}>
                {order.side.toUpperCase()}
              </span>
              <span>{formatNumber(order.size, 4)}</span>
              <span>{order.triggerPrice ? formatUsd(order.triggerPrice, 2) : '--'}</span>
              <span className="order-actions-cell">
                <button
                  className="btn-cancel-order"
                  onClick={() => handleCancelOrder(order)}
                  disabled={cancellingId === order.id || !isConnected}
                  title="Cancel order"
                >
                  {cancellingId === order.id ? '...' : '✕'}
                </button>
              </span>
            </div>
          ))}
        </>
      )}

      {recentOrders.length > 0 && (
        <>
          <p className="muted small" style={{ marginTop: 16, marginBottom: 8 }}>Recent Orders</p>
          <div className="orders-head">
            <span>ID</span>
            <span>Type</span>
            <span>Side</span>
            <span>Size</span>
            <span>Trigger</span>
            <span>Status</span>
          </div>
          {recentOrders.map((order) => (
            <div key={order.id} className="orders-row">
              <span>#{order.id.slice(-6)}</span>
              <span className="order-type-badge">{order.type}</span>
              <span className={order.side === 'buy' ? 'text-positive' : 'text-negative'}>
                {order.side.toUpperCase()}
              </span>
              <span>{formatNumber(order.size, 4)}</span>
              <span>{order.triggerPrice ? formatUsd(order.triggerPrice, 2) : '--'}</span>
              <span className={`order-status order-status-${order.status}`}>
                {order.status}
              </span>
            </div>
          ))}
        </>
      )}

      {data.length === 0 && (
        <p className="muted small">No open orders yet.</p>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmOrder)}
        title="Cancel order?"
        message="This will submit an on-chain transaction to cancel your order."
        confirmText="Cancel order"
        cancelText="Back"
        variant="warning"
        details={
          confirmOrder
            ? [
                { label: 'Order', value: `#${confirmOrder.id.slice(-6)}` },
                { label: 'Type', value: confirmOrder.type.toUpperCase() },
                { label: 'Side', value: confirmOrder.side.toUpperCase() },
                { label: 'Size', value: formatNumber(confirmOrder.size, 4) },
                { label: 'Trigger', value: confirmOrder.triggerPrice ? formatUsd(confirmOrder.triggerPrice, 2) : '--' },
                { label: 'Reduce only', value: confirmOrder.reduceOnly ? 'Yes' : 'No' },
              ]
            : undefined
        }
        onCancel={() => setConfirmOrder(null)}
        onConfirm={() => {
          if (!confirmOrder) return;
          const order = confirmOrder;
          setConfirmOrder(null);
          cancelOrderNow(order);
        }}
      />
    </div>
  );
}
