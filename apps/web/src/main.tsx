import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiConfig, configureChains, createConfig } from 'wagmi';
import { sepolia, base } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { publicProvider } from 'wagmi/providers/public';
import { CHAIN_ID_V2 } from './contracts-v2';
import { I18nProvider } from './lib/i18n';
import { SkipToMain } from './components/Accessibility';
import App from './App';
import './App.css';

// Support both Sepolia (V1) and Base (V2)
const chainsToUse = CHAIN_ID_V2 === 8453 ? [base, sepolia] : [sepolia];
const { chains, publicClient, webSocketPublicClient } = configureChains(chainsToUse, [publicProvider()]);

const connectors = [injected({ shimDisconnect: true })];
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;
if (wcProjectId) {
  connectors.push(walletConnect({ projectId: wcProjectId, showQrModal: true }));
}

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig}>
          <I18nProvider>
            <SkipToMain />
            <App />
          </I18nProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
