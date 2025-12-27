import React, { useMemo } from 'react';

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
};

export default function Sparkline({
  data,
  width = 80,
  height = 24,
  color,
  strokeWidth = 1.5,
}: SparklineProps) {
  const { path, trend } = useMemo(() => {
    if (data.length < 2) {
      return { path: '', trend: 'neutral' as const };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    });

    const trend = data[data.length - 1] >= data[0] ? 'up' : 'down';

    return {
      path: `M ${points.join(' L ')}`,
      trend,
    };
  }, [data, width, height]);

  const strokeColor = color || (trend === 'up' ? 'var(--emerald)' : 'var(--crimson)');

  if (data.length < 2) {
    return <div style={{ width, height }} className="sparkline-empty" />;
  }

  return (
    <svg
      width={width}
      height={height}
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`gradient-${trend}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Fill area */}
      <path
        d={`${path} L ${width},${height} L 0,${height} Z`}
        fill={`url(#gradient-${trend})`}
      />
      
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Generate mock price history for demo
export function generatePriceHistory(basePrice: number, points = 24): number[] {
  const data: number[] = [];
  let price = basePrice * (0.98 + Math.random() * 0.04);
  
  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.48) * basePrice * 0.008;
    price = Math.max(price + change, basePrice * 0.9);
    data.push(price);
  }
  
  // Ensure last price is close to basePrice
  data[data.length - 1] = basePrice;
  
  return data;
}

