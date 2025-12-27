import React, { useState } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { MARKET_ID_STRING } from '../contracts';
import FundingChart from '../components/FundingChart';

export default function AnalyticsPage() {
  const [activeMarketId] = useState(MARKET_ID_STRING);
  const { activeMarket } = useMarketData(activeMarketId);

  return (
    <>
      <section className="section funding-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Funding analytics</p>
            <h2>Historical rates</h2>
            <p className="muted">
              Track funding rate trends and historical data for all markets.
            </p>
          </div>
        </div>
        <div className="funding-grid">
          <FundingChart
            marketId={activeMarket?.symbol ?? 'ETH/USD'}
            currentRate={activeMarket?.fundingRate ?? 0.004}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Market analytics</p>
            <h2>Additional metrics</h2>
            <p className="muted">
              More analytics and metrics will be available here in the future.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

