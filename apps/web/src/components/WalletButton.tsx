import React from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { formatUnits } from 'viem';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  if (isConnected && address) {
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const ethBalance = balance ? Number(formatUnits(balance.value, balance.decimals)).toFixed(4) : '0';

    return (
      <div className="wallet-connected">
        <div className="wallet-info">
          <span className="wallet-balance">{ethBalance} ETH</span>
          <span className="wallet-address">{shortAddress}</span>
        </div>
        <button className="btn ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-buttons">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          className="btn primary"
          onClick={() => connect({ connector })}
          disabled={isPending}
        >
          {isPending ? 'Connecting...' : connector.name === 'Injected' ? 'Connect Wallet' : connector.name}
        </button>
      ))}
    </div>
  );
}

