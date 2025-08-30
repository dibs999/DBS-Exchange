import React from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config';

// The full application UI is quite extensive and will be built on top of
// the local simulation and on-chain utilities exported from other modules.
// For now this file hosts a minimal placeholder to demonstrate the
// repository structure.

export function AppBody() {
  return (
    <div className="min-h-screen w-full bg-black text-neutral-100">
      {/* TODO: Implement full UI based on provided prototype */}
      <h1 className="p-4 text-xl font-bold">DEX Börse Prototype</h1>
    </div>
  );
}

export default function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <AppBody />
    </WagmiConfig>
  );
}
