import React, { useEffect, useRef, useState } from 'react';
import { formatPct } from '../lib/format';

type FundingDataPoint = {
  time: string;
  rate: number;
};

// Generate mock funding rate history
function generateMockFundingHistory(): FundingDataPoint[] {
  const data: FundingDataPoint[] = [];
  const now = Date.now();
  
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 60 * 60 * 1000);
    // Generate realistic funding rate between -0.01% and 0.02%
    const baseRate = 0.005;
    const noise = (Math.random() - 0.4) * 0.015;
    const rate = baseRate + noise;
    
    data.push({
      time: time.toISOString(),
      rate: Number(rate.toFixed(6)),
    });
  }
  
  return data;
}

type FundingChartProps = {
  marketId: string;
  currentRate?: number;
};

export default function FundingChart({ marketId, currentRate = 0.004 }: FundingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<FundingDataPoint[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<FundingDataPoint | null>(null);

  useEffect(() => {
    setData(generateMockFundingHistory());
    
    // Simulate live updates
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev.slice(1)];
        const lastRate = prev[prev.length - 1]?.rate || 0.005;
        const noise = (Math.random() - 0.5) * 0.002;
        newData.push({
          time: new Date().toISOString(),
          rate: Number((lastRate + noise).toFixed(6)),
        });
        return newData;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [marketId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 10, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = 'rgba(10, 14, 22, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // Calculate scales
    const rates = data.map(d => d.rate);
    const minRate = Math.min(...rates, 0);
    const maxRate = Math.max(...rates);
    const rateRange = maxRate - minRate || 0.01;

    // Draw zero line
    const zeroY = padding.top + chartHeight * (1 - (0 - minRate) / rateRange);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw area fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, 'rgba(101, 240, 182, 0.3)');
    gradient.addColorStop(0.5, 'rgba(101, 240, 182, 0.1)');
    gradient.addColorStop(1, 'rgba(101, 240, 182, 0)');

    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight * (1 - (point.rate - minRate) / rateRange);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    // Close path for fill
    ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight * (1 - (point.rate - minRate) / rateRange);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = '#65f0b6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw points
    data.forEach((point, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + chartHeight * (1 - (point.rate - minRate) / rateRange);
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = point.rate >= 0 ? '#65f0b6' : '#ff8a8a';
      ctx.fill();
    });

    // Draw Y axis labels
    ctx.fillStyle = 'rgba(205, 214, 226, 0.65)';
    ctx.font = '10px Space Grotesk';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 4; i++) {
      const rate = maxRate - (rateRange * i) / 4;
      const y = padding.top + (chartHeight * i) / 4;
      ctx.fillText(`${(rate * 100).toFixed(3)}%`, padding.left - 8, y + 4);
    }

    // Draw X axis labels
    ctx.textAlign = 'center';
    const labelIndices = [0, Math.floor(data.length / 2), data.length - 1];
    labelIndices.forEach(i => {
      if (data[i]) {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const time = new Date(data[i].time);
        const label = `${time.getHours()}:00`;
        ctx.fillText(label, x, height - 10);
      }
    });

  }, [data]);

  // Calculate predicted annual rate
  const avgRate = data.length > 0 
    ? data.reduce((sum, d) => sum + d.rate, 0) / data.length 
    : 0;
  const annualRate = avgRate * 24 * 365;

  return (
    <div className="panel funding-chart-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Funding rate</p>
          <h3>{marketId}</h3>
        </div>
        <div className="funding-stats">
          <div className="funding-stat">
            <span className="label">Current (1h)</span>
            <span className={currentRate >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPct(currentRate * 100)}
            </span>
          </div>
          <div className="funding-stat">
            <span className="label">Predicted APR</span>
            <span className={annualRate >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPct(annualRate * 100)}
            </span>
          </div>
        </div>
      </div>

      <div className="funding-chart-container">
        <canvas ref={canvasRef} className="funding-canvas" />
      </div>

      <div className="funding-legend">
        <div className="legend-item">
          <span className="legend-dot positive" />
          <span className="muted small">Longs pay shorts</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot negative" />
          <span className="muted small">Shorts pay longs</span>
        </div>
      </div>
    </div>
  );
}

