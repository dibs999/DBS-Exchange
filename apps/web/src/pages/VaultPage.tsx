import React from 'react';
import { useAccount } from 'wagmi';
import LPVault from '../components/LPVault';
import WalletButton from '../components/WalletButton';

export default function VaultPage() {
  const { isConnected } = useAccount();

  return (
    <>
      <section className="section" id="liquidity">
        <div className="liquidity">
          <div>
            <p className="eyebrow">Protocol modules</p>
            <h2>Composable liquidity stack</h2>
            <p className="muted">
              Plug in additional markets, customize funding curves, and pipe new price sources without rewriting the
              core margin engine.
            </p>
          </div>
          <div className="liquidity-grid">
            <div>
              <p className="label">Collateral vault</p>
              <strong>8.4M oUSD</strong>
              <p className="muted small">Allocated to liquidity buffers.</p>
            </div>
            <div>
              <p className="label">Keepers</p>
              <strong>3 active</strong>
              <p className="muted small">Oracle updates + funding sync.</p>
            </div>
            <div>
              <p className="label">Risk tiers</p>
              <strong>Isolated / Cross</strong>
              <p className="muted small">Configurable per market.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        {isConnected ? (
          <LPVault />
        ) : (
          <div className="connect-prompt" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <h2>Connect Wallet</h2>
            <p className="muted" style={{ marginBottom: '2rem' }}>
              Connect your wallet to interact with the liquidity vault.
            </p>
            <WalletButton />
          </div>
        )}
      </section>
    </>
  );
}

