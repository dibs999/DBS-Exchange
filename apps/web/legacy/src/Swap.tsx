import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseUnits, formatUnits } from 'viem';
import { ADDR } from './config';
import { QUOTER_V2_ABI, SWAP_ROUTER_02_ABI } from './abis';

const FEE_TIER = 3000n; // 0.3%

export type PriceFeed = Record<string, { usd: number; change24h?: number }>;

type SwapPreset = {
  label: string;
  amount: string;
};

const PRESETS: SwapPreset[] = [
  { label: '0.1', amount: '0.1' },
  { label: '0.25', amount: '0.25' },
  { label: '0.5', amount: '0.5' },
  { label: '1', amount: '1' },
];

type SwapProps = {
  prices: PriceFeed;
};

export default function Swap({ prices }: SwapProps) {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect({ connector: injected() });
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualRate, setManualRate] = useState<string>('');
  const [usingSimulation, setUsingSimulation] = useState<boolean>(false);

  const addr = ADDR[chainId];

  const derivedRate = useMemo(() => {
    const eth = prices['ethereum'];
    const usdc = prices['usd-coin'];
    if (!eth || !usdc) return undefined;
    return eth.usd / usdc.usd;
  }, [prices]);

  useEffect(() => {
    if (manualRate) return;
    if (derivedRate) setManualRate(derivedRate.toFixed(4));
  }, [derivedRate, manualRate]);

  async function getQuote() {
    try {
      if (!amountIn || Number(amountIn) <= 0) {
        setStatus('Enter a valid amount.');
        return;
      }
      if (!addr) throw new Error('Unsupported network');
      if (!publicClient) throw new Error('RPC client not ready');
      const amt = parseUnits(amountIn, 18); // assume WETH input
      const q = await publicClient.readContract({
        address: addr.QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [addr.WETH, addr.USDC, FEE_TIER, amt, 0n],
      });
      setUsingSimulation(false);
      setQuote(formatUnits(q as bigint, 6));
      setStatus(null);
    } catch (err: any) {
      // When RPC access is blocked or fails, fall back to simulated pricing.
      const rate = manualRate ? Number(manualRate) : derivedRate;
      if (!rate) {
        setQuote(null);
        setStatus(err?.message || String(err));
        return;
      }
      const simulated = (Number(amountIn || '0') * rate).toFixed(6);
      setQuote(simulated);
      setUsingSimulation(true);
      setStatus('Live quote unavailable. Using price feed instead.');
    }
  }

  async function doSwap() {
    if (!walletClient) {
      setStatus('Wallet not connected');
      return;
    }
    if (!addr) {
      setStatus('Unsupported network for swap. Switch to mainnet or Sepolia.');
      return;
    }
    if (!publicClient) {
      setStatus('RPC client not ready');
      return;
    }
    try {
      if (!amountIn || Number(amountIn) <= 0) {
        setStatus('Enter a valid amount.');
        return;
      }
      const amtIn = parseUnits(amountIn || '0', 18);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const { request } = await publicClient.simulateContract({
        address: addr.SWAP_ROUTER_02,
        abi: SWAP_ROUTER_02_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: addr.WETH,
          tokenOut: addr.USDC,
          fee: FEE_TIER,
          recipient: address!,
          deadline,
          amountIn: amtIn,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
        value: amtIn,
        account: address!,
      });
      const hash = await walletClient.writeContract(request);
      setStatus(`Swap submitted: ${hash}`);
    } catch (err: any) {
      setStatus(err.message || String(err));
    }
  }

  async function handleConnect() {
    try {
      await connectAsync();
    } catch (err: any) {
      setStatus(err.message || String(err));
    }
  }

  return (
    <div className="swap-card">
      <div className="swap-header">
        <div>
          <p className="label">Wallet</p>
          <p className="value">{isConnected ? address : 'Not connected'}</p>
        </div>
        {isConnected ? (
          <button onClick={() => disconnect()} className="btn ghost">Disconnect</button>
        ) : (
          <button onClick={handleConnect} className="btn primary">Connect Wallet</button>
        )}
      </div>

      <div className="field">
        <label>Amount in WETH</label>
        <div className="input-row">
          <input
            type="number"
            min="0"
            step="0.0001"
            placeholder="0.25"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setAmountIn(p.amount)} className="chip">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>Price source</label>
        <div className="input-row">
          <input
            type="number"
            min="0"
            step="0.0001"
            placeholder="Live or simulated rate"
            value={manualRate}
            onChange={(e) => setManualRate(e.target.value)}
          />
          <span className="hint">USDC per 1 WETH</span>
        </div>
      </div>

      <div className="actions">
        <button onClick={getQuote} className="btn secondary">Get Quote</button>
        {isConnected && (
          <button onClick={doSwap} className="btn primary">Swap</button>
        )}
      </div>

      {quote && (
        <div className="quote">
          <p className="label">Estimated USDC out</p>
          <p className="value">{quote}</p>
          {usingSimulation && <p className="badge">Simulated from public price feed</p>}
        </div>
      )}

      {status && <div className="status">{status}</div>}
    </div>
  );
}
