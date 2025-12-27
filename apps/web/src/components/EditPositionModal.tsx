import React, { useState, useMemo } from 'react';
import { usePublicClient, useWalletClient, useAccount } from 'wagmi';
import { parseUnits, stringToHex } from 'viem';
import { Position } from '@dbs/shared';
import { formatNumber, formatUsd } from '../lib/format';
import { ORDERBOOK_V2_ADDRESS, ORDERBOOK_V2_ABI } from '../contracts-v2';
import { useToast } from './Toast';
import { FocusTrap } from './Accessibility';

type EditPositionModalProps = {
    isOpen: boolean;
    onClose: () => void;
    position: Position;
};

export default function EditPositionModal({ isOpen, onClose, position }: EditPositionModalProps) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { addToast } = useToast();

    const [tpPrice, setTpPrice] = useState('');
    const [slPrice, setSlPrice] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset inputs when modal opens or position changes
    React.useEffect(() => {
        if (isOpen) {
            setTpPrice('');
            setSlPrice('');
        }
    }, [isOpen, position.id]);

    const isLong = position.side === 'long';

    // Calculate P&L for TP/SL scenarios
    const tpPnl = useMemo(() => {
        if (!tpPrice) return null;
        const exitPrice = Number(tpPrice);
        const priceDiff = isLong ? exitPrice - position.entryPrice : position.entryPrice - exitPrice;
        return priceDiff * position.size;
    }, [tpPrice, position, isLong]);

    const slPnl = useMemo(() => {
        if (!slPrice) return null;
        const exitPrice = Number(slPrice);
        const priceDiff = isLong ? exitPrice - position.entryPrice : position.entryPrice - exitPrice;
        return priceDiff * position.size;
    }, [slPrice, position, isLong]);

    async function handleSubmit() {
        if (!walletClient || !publicClient || !address) return;

        // Simple validation
        if (!tpPrice && !slPrice) {
            onClose();
            return;
        }

        setLoading(true);
        try {
            const marketIdHex = stringToHex(position.marketId, { size: 32 });
            // To close a LONG, we need to SELL (negative size). To close a SHORT, we need to BUY (positive size).
            // However, Position.side is 'long' or 'short'.
            // If Long: we need a Sell order. Size should be negative: -position.size
            // If Short: we need a Buy order. Size should be positive: position.size
            // BUT: The contract's placeOrder expects `size` to be signed.
            // placeOrder(marketId, size, price, ...)
            // size > 0 = Buy/Long, size < 0 = Sell/Short.

            const sizeUnits = parseUnits(position.size.toString(), 18);
            const closeSizeWei = isLong ? -sizeUnits : sizeUnits;

            const txs = [];

            // 1. Take Profit Order (Limit Order)
            if (tpPrice) {
                const priceWei = parseUnits(tpPrice, 18);
                const { request } = await publicClient.simulateContract({
                    address: ORDERBOOK_V2_ADDRESS,
                    abi: ORDERBOOK_V2_ABI,
                    functionName: 'placeOrder',
                    args: [
                        marketIdHex,
                        closeSizeWei,
                        priceWei, // Limit Price
                        0, // Mode: Continuous
                        1, // Type: Limit
                        0n, // Trigger Price (0 for Limit)
                        0, // maxSlippageBps (0 = no limit)
                    ],
                    account: address,
                });
                txs.push({ type: 'TP', request });
            }

            // 2. Stop Loss Order (Stop Market Order)
            if (slPrice) {
                const triggerWei = parseUnits(slPrice, 18);
                // For Stop Market, price arg is usually 0 or max slippage, but triggerPrice is the key.
                // Assuming OrderType 2 (Stop) uses triggerPrice.
                const { request } = await publicClient.simulateContract({
                    address: ORDERBOOK_V2_ADDRESS,
                    abi: ORDERBOOK_V2_ABI,
                    functionName: 'placeOrder',
                    args: [
                        marketIdHex,
                        closeSizeWei,
                        0n, // Price (Market execution when triggered)
                        0, // Mode
                        2, // Type: Stop
                        triggerWei, // Trigger Price
                        0, // maxSlippageBps (0 = no limit)
                    ],
                    account: address,
                });
                txs.push({ type: 'SL', request });
            }

            // Execute Transactions (Sequentially for now as we don't have Multicall)
            // Note: This asks for multiple signatures, which is bad UX but necessary without multicall.
            for (const tx of txs) {
                const hash = await walletClient.writeContract(tx.request);
                addToast({
                    type: 'info',
                    title: `Setting ${tx.type}...`,
                    message: 'Transaction submitted.',
                    txHash: hash,
                });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            addToast({
                type: 'success',
                title: 'Triggers Updated',
                message: `Successfully set TP/SL for ${position.marketId}`,
            });
            onClose();

        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Failed to set triggers',
                message: err?.shortMessage || err?.message || 'Unknown error',
            });
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <FocusTrap isActive={isOpen}>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>Edit Position: {position.marketId}</h3>
                        <button className="modal-close" onClick={onClose}>✕</button>
                    </div>

                    <div className="modal-body">
                        <div className="modal-info">
                            <div className="detail-row">
                                <span className="label">Entry Price</span>
                                <span>{formatUsd(position.entryPrice, 2)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="label">Mark Price</span>
                                <span>{formatUsd(position.markPrice, 2)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="label">Size</span>
                                <span>{formatNumber(position.size, 4)} {position.marketId.split('-')[0]}</span>
                            </div>
                        </div>

                        <div className="input-group" style={{ marginTop: 16 }}>
                            <label>Take Profit (Order will close position)</label>
                            <div className="input-with-max">
                                <input
                                    type="number"
                                    value={tpPrice}
                                    onChange={(e) => setTpPrice(e.target.value)}
                                    placeholder={isLong ? "Higher than entry" : "Lower than entry"}
                                    step="0.01"
                                />
                            </div>
                            {tpPnl !== null && (
                                <p className={`input-hint ${tpPnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                                    Est. P&L: {tpPnl >= 0 ? '+' : ''}{formatUsd(tpPnl, 2)}
                                </p>
                            )}
                        </div>

                        <div className="input-group" style={{ marginTop: 16 }}>
                            <label>Stop Loss (Order will close position)</label>
                            <div className="input-with-max">
                                <input
                                    type="number"
                                    value={slPrice}
                                    onChange={(e) => setSlPrice(e.target.value)}
                                    placeholder={isLong ? "Lower than entry" : "Higher than entry"}
                                    step="0.01"
                                />
                            </div>
                            {slPnl !== null && (
                                <p className={`input-hint ${slPnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                                    Est. P&L: {slPnl >= 0 ? '+' : ''}{formatUsd(slPnl, 2)}
                                </p>
                            )}
                        </div>

                        <div className="liquidation-alert yellow" style={{ marginTop: 20 }}>
                            <strong>⚠️ Note</strong>
                            <p className="small">
                                These creates separate Limit/Stop orders. If you manually close your position,
                                you must manually cancel these orders to avoid opening an opposite position.
                            </p>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button className="btn ghost" onClick={onClose}>Cancel</button>
                        <button className="btn primary" onClick={handleSubmit} disabled={loading || (!tpPrice && !slPrice)}>
                            {loading ? 'Signing...' : 'Confirm TP/SL'}
                        </button>
                    </div>
                </div>
            </div>
        </FocusTrap>
    );
}
