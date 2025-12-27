import React, { useEffect, useRef } from 'react';

type Props = {
  symbol: string;
};

export default function TradingViewChart({ symbol }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    // Clear container safely (avoid innerHTML for XSS protection)
    if (container.current) {
      while (container.current.firstChild) {
        container.current.removeChild(container.current.firstChild);
      }
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.type = 'text/javascript';
    
    // Sanitize symbol to prevent XSS (remove potentially dangerous characters)
    const sanitizedSymbol = symbol.replace(/[<>\"'&]/g, '');
    
    // TradingView widget requires innerHTML, but we sanitize the input
    const config = {
      autosize: true,
      symbol: sanitizedSymbol,
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
    };
    
    // JSON.stringify is safe for structured data
    script.innerHTML = JSON.stringify(config);

    container.current.appendChild(script);

    return () => {
      // Cleanup safely
      if (container.current) {
        while (container.current.firstChild) {
          container.current.removeChild(container.current.firstChild);
        }
      }
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
