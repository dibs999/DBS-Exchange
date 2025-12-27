import React from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';

export default function NetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  // Only show if connected and on wrong network
  if (!isConnected || chainId === sepolia.id) {
    return null;
  }

  return (
    <div className="network-banner">
      <div className="network-banner-content">
        <span className="network-icon">⚠️</span>
        <span>
          You're connected to the wrong network. Please switch to <strong>Sepolia Testnet</strong> to use DBS Exchange.
        </span>
        <button 
          className="btn primary small" 
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isPending}
        >
          {isPending ? 'Switching...' : 'Switch to Sepolia'}
        </button>
      </div>
    </div>
  );
}
