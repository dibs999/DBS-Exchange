import React, { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseUnits, formatUnits } from 'viem';
import { ADDR } from './config';
import { QUOTER_V2_ABI, SWAP_ROUTER_02_ABI } from './abis';

const FEE_TIER = 3000n; // 0.3%

export default function Swap() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect({ connector: injected() });
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const addr = ADDR[chainId];

  async function getQuote() {
    try {
      if (!amountIn) return;
      const amt = parseUnits(amountIn, 18); // assume WETH input
      const q = await publicClient.readContract({
        address: addr.QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [addr.WETH, addr.USDC, FEE_TIER, amt, 0n],
      });
      setQuote(formatUnits(q as bigint, 6));
    } catch (err: any) {
      setQuote(null);
      setStatus(err.message || String(err));
    }
  }

  async function doSwap() {
    if (!walletClient) {
      setStatus('Wallet not connected');
      return;
    }
    try {
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
    <div className="space-y-4">
      <div>
        {isConnected ? (
          <button onClick={() => disconnect()} className="px-3 py-1 bg-neutral-800 rounded">Disconnect {address?.slice(0,6)}...</button>
        ) : (
          <button onClick={handleConnect} className="px-3 py-1 bg-neutral-800 rounded">Connect Wallet</button>
        )}
      </div>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Amount in WETH"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          className="w-full p-2 bg-neutral-900 rounded"
        />
        <button onClick={getQuote} className="px-3 py-1 bg-neutral-700 rounded">Get Quote</button>
        {quote && <div>Estimated USDC out: {quote}</div>}
      </div>
      {isConnected && (
        <button onClick={doSwap} className="px-3 py-1 bg-indigo-600 rounded">Swap</button>
      )}
      {status && <div className="text-sm text-red-400">{status}</div>}
    </div>
  );
}

