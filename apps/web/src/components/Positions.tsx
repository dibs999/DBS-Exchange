import React, { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { stringToHex } from 'viem';
import { Position } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';
import { ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY } from '../contracts';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';

type PositionsProps = {
  data: Position[];
};

export default function Positions({ data }: PositionsProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();
  
  const [closingId, setClosingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmPos, setConfirmPos] = useState<Position | null>(null);

  async function closePositionNow(position: Position) {
    if (!walletClient || !publicClient || !address || !ENGINE_READY) return;

    setClosingId(position.id);
    try {
      const marketIdHex = stringToHex(position.marketId, { size: 32 });
      
      const { request } = await publicClient.simulateContract({
        address: ENGINE_ADDRESS,
        abi: ENGINE_ABI,
        functionName: 'closePosition',
        args: [marketIdHex],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Closing position',
        message: `Closing ${position.marketId} ${position.side}...`,
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Position closed',
        message: `Your ${position.marketId} ${position.side} position has been closed.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Failed to close position',
        message: err?.shortMessage || err?.message || 'Unknown error',
      });
    } finally {
      setClosingId(null);
    }
  }

  function handleClosePosition(position: Position) {
    if (!settings.showConfirmations) {
      closePositionNow(position);
      return;
    }
    setConfirmPos(position);
  }

  return (
    <div className="panel positions-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Positions</p>
          <h3>Open exposure</h3>
        </div>
        <div className="positions-summary">
          {data.length > 0 && (
            <span className={data.reduce((s, p) => s + p.pnl, 0) >= 0 ? 'text-positive' : 'text-negative'}>
              {data.reduce((s, p) => s + p.pnl, 0) >= 0 ? '+' : ''}
              {formatUsd(data.reduce((s, p) => s + p.pnl, 0), 2)}
            </span>
          )}
          <button className="chip ghost">Live</button>
        </div>
      </div>

      <div className="positions-head">
        <span>Market</span>
        <span>Side</span>
        <span>Size</span>
        <span>Entry</span>
        <span>Mark</span>
        <span>P&L</span>
        <span></span>
      </div>

      {data.length === 0 ? (
        <p className="muted small">No open positions yet.</p>
      ) : (
        data.map((pos) => (
          <div key={pos.id} className="position-item">
            <div 
              className="positions-row"
              onClick={() => setExpandedId(expandedId === pos.id ? null : pos.id)}
            >
              <span>{pos.marketId}</span>
              <span className={pos.side === 'long' ? 'text-positive' : 'text-negative'}>
                {pos.side.toUpperCase()}
              </span>
              <span>{formatNumber(pos.size, 4)}</span>
              <span>{formatUsd(pos.entryPrice, 2)}</span>
              <span>{formatUsd(pos.markPrice, 2)}</span>
              <span className={pos.pnl >= 0 ? 'text-positive' : 'text-negative'}>
                {pos.pnl >= 0 ? '+' : ''}{formatUsd(pos.pnl, 2)}
              </span>
              <span className="position-actions-cell">
                <button
                  className="btn-close-position"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClosePosition(pos);
                  }}
                  disabled={closingId === pos.id || !isConnected}
                  title="Close position"
                >
                  {closingId === pos.id ? '...' : '✕'}
                </button>
              </span>
            </div>

            {expandedId === pos.id && (
              <div className="position-details">
                <div className="detail-row">
                  <span className="label">Leverage</span>
                  <span>{pos.leverage}x</span>
                </div>
                <div className="detail-row">
                  <span className="label">Margin</span>
                  <span>{formatUsd(pos.margin, 2)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Liquidation Price</span>
                  <span className="text-negative">{formatUsd(pos.liquidationPrice, 2)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Notional</span>
                  <span>{formatUsd(pos.size * pos.markPrice, 2)}</span>
                </div>
                <div className="detail-row">
                  <span className="label">ROE</span>
                  <span className={pos.pnl >= 0 ? 'text-positive' : 'text-negative'}>
                    {pos.margin > 0 ? ((pos.pnl / pos.margin) * 100).toFixed(2) : 0}%
                  </span>
                </div>
                
                <div className="position-actions">
                  <button 
                    className="btn secondary"
                    onClick={() => handleClosePosition(pos)}
                    disabled={closingId === pos.id || !isConnected}
                  >
                    {closingId === pos.id ? 'Closing...' : 'Close Position'}
                  </button>
                  <button className="btn ghost" disabled>
                    Add Margin
                  </button>
                  <button className="btn ghost" disabled>
                    Set TP/SL
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmPos)}
        title="Close position?"
        message="This will submit an on-chain transaction to close your position."
        confirmText="Close"
        cancelText="Cancel"
        variant="danger"
        details={
          confirmPos
            ? [
                { label: 'Market', value: confirmPos.marketId },
                { label: 'Side', value: confirmPos.side.toUpperCase() },
                { label: 'Size', value: `${formatNumber(confirmPos.size, 4)} ETH` },
                { label: 'Entry', value: formatUsd(confirmPos.entryPrice, 2) },
                { label: 'Mark', value: formatUsd(confirmPos.markPrice, 2) },
                { label: 'Unrealized P&L', value: formatUsd(confirmPos.pnl, 2) },
              ]
            : undefined
        }
        onCancel={() => setConfirmPos(null)}
        onConfirm={() => {
          if (!confirmPos) return;
          const pos = confirmPos;
          setConfirmPos(null);
          closePositionNow(pos);
        }}
      />
    </div>
  );
}
