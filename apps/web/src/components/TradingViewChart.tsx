import React, { useEffect, useRef } from 'react';

type Props = {
  symbol: string;
};

export default function TradingViewChart({ symbol }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      container_id: 'tv-chart',
    });

    container.current.appendChild(script);

    return () => {
      if (container.current) container.current.innerHTML = '';
    };
  }, [symbol]);

  return (
    <div className="chart-shell">
      <div className="tradingview-widget-container" ref={container}>
        <div id="tv-chart" className="tradingview-widget-container__widget" />
      </div>
    </div>
  );
}
