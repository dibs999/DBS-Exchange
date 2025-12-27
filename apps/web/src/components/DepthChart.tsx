import React, { useMemo, useState } from 'react';

type OrderBookLevel = {
    price: number;
    size: number;
    total?: number;
};

type Props = {
    bids: { price: number; size: number }[];
    asks: { price: number; size: number }[];
    currentPrice: number;
};

export default function DepthChart({ bids, asks, currentPrice }: Props) {
    const [hoverPrice, setHoverPrice] = useState<number | null>(null);
    const [hoverVol, setHoverVol] = useState<number | null>(null);

    // Process data for cumulative depth
    const { processedBids, processedAsks, maxTotal } = useMemo(() => {
        let bidAcc = 0;
        const pBids = [...bids].sort((a, b) => b.price - a.price).map(b => {
            bidAcc += b.size;
            return { ...b, total: bidAcc };
        });

        let askAcc = 0;
        const pAsks = [...asks].sort((a, b) => a.price - b.price).map(a => {
            askAcc += a.size;
            return { ...a, total: askAcc };
        });

        // Take top 50 levels for performance
        const limitBids = pBids.slice(0, 50);
        const limitAsks = pAsks.slice(0, 50);

        const max = Math.max(
            limitBids.length > 0 ? limitBids[limitBids.length - 1].total! : 0,
            limitAsks.length > 0 ? limitAsks[limitAsks.length - 1].total! : 0
        );

        return { processedBids: limitBids, processedAsks: limitAsks, maxTotal: max || 1 };
    }, [bids, asks]);

    if (processedBids.length === 0 && processedAsks.length === 0) {
        return <div className="depth-chart-placeholder muted">No orderbook data</div>;
    }

    // Visualization params
    const width = 600;
    const height = 300;
    const padding = 20;

    // X-Scale: Auto-range based on visible bids/asks
    const minPrice = processedBids.length > 0 ? processedBids[processedBids.length - 1].price : currentPrice * 0.95;
    const maxPrice = processedAsks.length > 0 ? processedAsks[processedAsks.length - 1].price : currentPrice * 1.05;
    const priceRange = maxPrice - minPrice || 1;

    const getX = (price: number) => ((price - minPrice) / priceRange) * width;
    const getY = (total: number) => height - ((total / maxTotal) * (height - padding)) - padding;

    // Build SVG Paths
    const buildPath = (data: OrderBookLevel[], isBid: boolean) => {
        if (data.length === 0) return '';

        let d = `M ${getX(isBid ? data[0].price : data[0].price)} ${height} `; // Start bottom

        if (isBid) {
            // Bids go right to left (highest price to lowest)
            // But on chart, X axis increases L->R.
            // Bids are on the left side (lower prices to match Asks? No, standard is Prices increase L->R)
            // Standard Depth Chart: Left Side = Bids (Green), Right Side = Asks (Red).
            // Middle = Mid Price.
            // So Bids range from minPrice to MidPrice. Asks range from MidPrice to maxPrice.

            // Let's iterate:
            // For bids, we draw from lowest price to highest price?
            // Data is sorted Descending (Best Bid first).

            // Reverse for drawing L->R (Low Price -> High Price)
            const reversed = [...data].reverse();
            reversed.forEach(pt => {
                d += `L ${getX(pt.price)} ${getY(pt.total!)} `;
                // Step effect? usually depth charts are steps.
                // For smooth area, direct line is fine.
            });
            // Close to mid bottom
            d += `L ${getX(data[0].price)} ${height}`;
        } else {
            // Asks: Lowest Price (Best Ask) -> High Price
            data.forEach(pt => {
                d += `L ${getX(pt.price)} ${getY(pt.total!)} `;
            });
            d += `L ${getX(data[data.length - 1].price)} ${height}`;
        }

        d += ' Z';
        return d;
    };

    const bidPath = buildPath(processedBids, true);
    const askPath = buildPath(processedAsks, false);

    return (
        <div className="panel depth-chart-panel" style={{ height: 320, position: 'relative' }}>
            <h3 className="panel-header" style={{ position: 'absolute', top: 10, left: 10, margin: 0, zIndex: 10 }}>Market Depth</h3>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="depth-chart-svg"
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%' }}
                onMouseLeave={() => { setHoverPrice(null); setHoverVol(null); }}
            >
                <defs>
                    <linearGradient id="bidGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="askGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" />
                    </linearGradient>
                </defs>

                {/* Areas */}
                <path d={bidPath} fill="url(#bidGradient)" stroke="#10b981" strokeWidth="1" />
                <path d={askPath} fill="url(#askGradient)" stroke="#ef4444" strokeWidth="1" />

                {/* Axes */}
                <line x1={0} y1={height - 20} x2={width} y2={height - 20} stroke="#333" strokeDasharray="4" />
                <text x={width / 2} y={height - 5} fill="#666" fontSize="12" textAnchor="middle">{currentPrice.toFixed(2)}</text>
                <text x={10} y={height - 5} fill="#666" fontSize="12">{minPrice.toFixed(2)}</text>
                <text x={width - 10} y={height - 5} fill="#666" fontSize="12" textAnchor="end">{maxPrice.toFixed(2)}</text>

            </svg>
        </div>
    );
}
