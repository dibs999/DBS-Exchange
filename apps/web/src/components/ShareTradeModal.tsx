import React, { useRef, useState } from 'react';
import { useToast } from './Toast';
import { formatUsd, formatPct } from '../lib/format';

type ShareTradeProps = {
    position: {
        marketId: string;
        side: 'long' | 'short';
        size: number;
        entryPrice: number;
        markPrice: number;
        pnl: number;
        pnlPct: number;
        leverage?: number;
    };
    onClose: () => void;
};

export default function ShareTradeModal({ position, onClose }: ShareTradeProps) {
    const { addToast } = useToast();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [generating, setGenerating] = useState(false);

    const generateImage = async (): Promise<string> => {
        const canvas = canvasRef.current;
        if (!canvas) return '';

        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        const width = 600;
        const height = 400;
        canvas.width = width;
        canvas.height = height;

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0b0d12');
        gradient.addColorStop(1, '#1a1d24');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Border accent
        ctx.strokeStyle = position.pnl >= 0 ? '#10b981' : '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, width - 4, height - 4);

        // Logo/Brand
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
        ctx.fillText('DBS Exchange', 30, 50);

        // Side badge
        const sideColor = position.side === 'long' ? '#10b981' : '#ef4444';
        ctx.fillStyle = sideColor;
        ctx.fillRect(width - 120, 20, 90, 32);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillText(position.side.toUpperCase(), width - 100, 43);

        // Market
        ctx.fillStyle = '#888';
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.fillText(position.marketId, 30, 90);

        // PnL - Big number
        ctx.fillStyle = position.pnl >= 0 ? '#10b981' : '#ef4444';
        ctx.font = 'bold 64px Inter, system-ui, sans-serif';
        const pnlText = `${position.pnl >= 0 ? '+' : ''}${formatUsd(position.pnl, 2)}`;
        ctx.fillText(pnlText, 30, 180);

        // PnL %
        ctx.font = 'bold 32px Inter, system-ui, sans-serif';
        ctx.fillText(`(${position.pnlPct >= 0 ? '+' : ''}${position.pnlPct.toFixed(2)}%)`, 30, 230);

        // Stats row
        ctx.fillStyle = '#666';
        ctx.font = '14px Inter, system-ui, sans-serif';
        ctx.fillText('Entry', 30, 290);
        ctx.fillText('Mark', 180, 290);
        ctx.fillText('Size', 330, 290);
        if (position.leverage) ctx.fillText('Leverage', 480, 290);

        ctx.fillStyle = '#fff';
        ctx.font = '18px Inter, system-ui, sans-serif';
        ctx.fillText(formatUsd(position.entryPrice, 2), 30, 315);
        ctx.fillText(formatUsd(position.markPrice, 2), 180, 315);
        ctx.fillText(`${position.size.toFixed(4)} ETH`, 330, 315);
        if (position.leverage) ctx.fillText(`${position.leverage}x`, 480, 315);

        // Footer
        ctx.fillStyle = '#444';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillText('Trade on DBS Exchange • dbs.exchange', 30, 375);

        return canvas.toDataURL('image/png');
    };

    const handleCopyImage = async () => {
        setGenerating(true);
        try {
            const canvas = canvasRef.current;
            if (!canvas) return;

            await generateImage();

            canvas.toBlob(async (blob) => {
                if (!blob) return;

                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    addToast({ type: 'success', title: 'Copied!', message: 'Image copied to clipboard' });
                } catch {
                    // Fallback: download
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `trade-${position.marketId}-${Date.now()}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addToast({ type: 'success', title: 'Downloaded!', message: 'Image saved to downloads' });
                }
            }, 'image/png');
        } finally {
            setGenerating(false);
        }
    };

    const handleShareTwitter = async () => {
        const pnlSign = position.pnl >= 0 ? '+' : '';
        const text = `Just made ${pnlSign}${formatUsd(position.pnl, 2)} (${pnlSign}${position.pnlPct.toFixed(1)}%) on ${position.marketId} ${position.side.toUpperCase()} @DBSExchange 🚀`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    // Pre-generate on mount
    React.useEffect(() => {
        generateImage();
    }, []);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal share-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                <div className="modal-header">
                    <h3>📸 Share Your Trade</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ textAlign: 'center' }}>
                    <canvas
                        ref={canvasRef}
                        style={{
                            width: '100%',
                            maxWidth: 600,
                            borderRadius: 8,
                            border: '1px solid #333'
                        }}
                    />
                </div>

                <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn ghost" onClick={handleCopyImage} disabled={generating}>
                        {generating ? 'Generating...' : '📋 Copy Image'}
                    </button>
                    <button className="btn primary" onClick={handleShareTwitter}>
                        🐦 Share on X
                    </button>
                </div>
            </div>
        </div>
    );
}
