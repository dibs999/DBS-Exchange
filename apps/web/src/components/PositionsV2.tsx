import React, { useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, stringToHex } from 'viem';
import { Position } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';
import { ORDERBOOK_V2_ABI, ORDERBOOK_V2_ADDRESS, ORDERBOOK_V2_READY, CHAIN_ID_V2 } from '../contracts-v2';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useSettings } from '../lib/settings';
import EditPositionModal from './EditPositionModal';

type PositionsV2Props = {
  data: Position[];
};

function getLiquidationStatus(position: Position) {
  if (!position.liquidationPrice || !position.markPrice) {
    return { price: null, distance: null, warning: 'none' as const };
  }

  const distance =
    position.side === 'long'
      ? ((position.markPrice - position.liquidationPrice) / position.markPrice) * 100
      : ((position.liquidationPrice - position.markPrice) / position.markPrice) * 100;

  let warning: 'none' | 'yellow' | 'orange' | 'red' = 'none';
  if (distance < 2) {
    warning = 'red';
  } else if (distance < 5) {
    warning = 'orange';
  } else if (distance < 10) {
    warning = 'yellow';
  }

  return { price: position.liquidationPrice, distance, warning };
}

export default function PositionsV2({ data }: PositionsV2Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();
  const { settings } = useSettings();

  const [closingId, setClosingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmPos, setConfirmPos] = useState<Position | null>(null);
  const [editPos, setEditPos] = useState<Position | null>(null);

  async function closePositionNow(position: Position) {
    if (!walletClient || !publicClient || !address || !ORDERBOOK_V2_READY) return;
    if (chainId !== CHAIN_ID_V2) {
      addToast({ type: 'warning', title: 'Wrong network', message: 'Switch to Base to close positions.' });
      return;
    }

    setClosingId(position.id);
    try {
      const marketIdHex = stringToHex(position.marketId, { size: 32 });
      const sizeUnits = parseUnits(position.size.toString(), 18);
      const signedSize = position.side === 'long' ? -sizeUnits : sizeUnits;
      const maxSlippageBps = Math.floor(settings.slippageTolerancePct * 100);

      const { request } = await publicClient.simulateContract({
        address: ORDERBOOK_V2_ADDRESS,
        abi: ORDERBOOK_V2_ABI,
        functionName: 'placeOrder',
        args: [marketIdHex, signedSize, 0n, 0, 0, 0n, maxSlippageBps],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Closing position',
        message: `Submitting market close for ${position.marketId}...`,
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Position close submitted',
        message: `Your ${position.marketId} position is being closed.`,
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
          <p className="eyebrow">Positions (V2)</p>
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
        data.map((pos) => {
          const liquidation = getLiquidationStatus(pos);
          const warningClass =
            liquidation.warning === 'red'
              ? 'liquidation-warning-red'
              : liquidation.warning === 'orange'
              ? 'liquidation-warning-orange'
              : liquidation.warning === 'yellow'
              ? 'liquidation-warning-yellow'
              : '';

          return (
            <div key={pos.id} className={`position-item ${warningClass}`}>
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
                  {liquidation.warning !== 'none' && (
                    <span
                      className={`liquidation-badge ${liquidation.warning}`}
                      title={`${liquidation.distance?.toFixed(2)}% from liquidation`}
                    >
                      ⚠️
                    </span>
                  )}
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
                  {liquidation.warning !== 'none' && (
                    <div className={`liquidation-alert ${liquidation.warning}`}>
                      <strong>⚠️ Liquidation Warning</strong>
                      <p className="muted small">
                        Position is {liquidation.distance?.toFixed(2)}% away from liquidation price.
                        {liquidation.warning === 'red' && ' Consider closing or adding margin immediately.'}
                        {liquidation.warning === 'orange' && ' Consider reducing position size or adding margin.'}
                        {liquidation.warning === 'yellow' && ' Monitor closely.'}
                      </p>
                    </div>
                  )}
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
                    <span
                      className={`text-negative ${liquidation.warning !== 'none' ? `liquidation-price-${liquidation.warning}` : ''}`}
                    >
                      {liquidation.price ? formatUsd(liquidation.price, 2) : formatUsd(pos.liquidationPrice, 2)}
                      {liquidation.distance !== null && (
                        <span className="muted small"> ({liquidation.distance.toFixed(2)}% away)</span>
                      )}
                    </span>
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
                    <button className="btn ghost" onClick={() => setEditPos(pos)}>
                      Set TP/SL
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmPos)}
        title="Close position?"
        message="This will submit an on-chain market order to close your position."
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

      {editPos && (
        <EditPositionModal
          isOpen={Boolean(editPos)}
          onClose={() => setEditPos(null)}
          position={editPos}
        />
      )}
    </div>
  );
}
