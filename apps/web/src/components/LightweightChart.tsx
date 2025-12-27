import React, { useEffect, useRef, useState } from 'react';
import { Position, Order } from '@dbs/shared';

// Since we cannot install types, we declare the global
declare const LightweightCharts: any;

type Props = {
  symbol: string;
  price: number;
  orders: Order[];
  positions: Position[];
};

// Generate dummy initial data
function generateInitialData(currentPrice: number, count = 100) {
  const data = [];
  let time = Math.floor(Date.now() / 1000) - count * 60;
  let open = currentPrice;

  for (let i = 0; i < count; i++) {
    const volatility = currentPrice * 0.002;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    data.push({
      time: time,
      open,
      high,
      low,
      close,
    });

    open = close;
    time += 60;
  }
  return data;
}

export default function LightweightChart({ symbol, price, orders, positions }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [lastPrice, setLastPrice] = useState(price);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Check if library is loaded
    if (typeof LightweightCharts === 'undefined') {
      console.error('LightweightCharts library not loaded via CDN');
      return;
    }

    const chart = LightweightCharts.createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#0b0d12' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#1a1d24' },
        horzLines: { color: '#1a1d24' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Magnet mode
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Initial Data
    const initialData = generateInitialData(price);
    candlestickSeries.setData(initialData);

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []); // Run once on mount

  // Update real-time price
  useEffect(() => {
    if (!seriesRef.current || price === lastPrice) return;

    const currentTime = Math.floor(Date.now() / 1000);
    // Determine if we need a new bar or update current
    // Simple logic: update the last bar with new close/high/low
    // BUT since generateInitialData ends at "now", we probably just update the latest bar
    // For this demo, we'll just update the last bar in place to "animate" it. 
    // In a real app we'd check timestamps.

    // We fetch the last data point from the series... wait, LWCharts doesn't give easy read access.
    // We'll just push a new update with the SAME time as the last generated one, or next minute.
    // Let's assume the last generated point was < 1 min ago.

    seriesRef.current.update({
      time: currentTime,
      open: lastPrice,
      high: Math.max(lastPrice, price),
      low: Math.min(lastPrice, price),
      close: price,
    });

    setLastPrice(price);
  }, [price, lastPrice]);

  // Update Price Lines (Orders & Positions)
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove old lines
    priceLinesRef.current.forEach(line => {
      seriesRef.current.removePriceLine(line);
    });
    priceLinesRef.current = [];

    // Add Position Lines
    positions.forEach(pos => {
      if (pos.marketId !== symbol && pos.marketId !== symbol.replace('USD', '')) return; // Filter by market if needed

      // Entry Price
      const line = seriesRef.current.createPriceLine({
        price: pos.entryPrice,
        color: pos.side === 'long' ? '#10b981' : '#ef4444',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: `POS ${pos.side.toUpperCase()} @ ${pos.entryPrice}`,
      });
      priceLinesRef.current.push(line);
    });

    // Add Order Lines
    orders.forEach(order => {
      // Filter orders? Assuming passed orders are relevant.
      const line = seriesRef.current.createPriceLine({
        price: Number(order.triggerPrice || order.price),
        color: order.size > 0 ? '#10b981' : '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `${order.orderType === 1 ? 'LMT' : 'STP'} #${order.orderId.toString().slice(-4)}`,
      });
      priceLinesRef.current.push(line);

      // Visualize Trigger Orders attached to positions (TP/SL) if we had them in a unified list
      // Currently TP/SL are separate orders in the system, so they should appear here if 'orders' contains them.
    });

  }, [orders, positions, symbol]);

  return (
    <div className="chart-shell panel" style={{ height: 500, padding: 0, overflow: 'hidden', border: '1px solid #333' }}>
      {/* Header overlay could go here */}
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
