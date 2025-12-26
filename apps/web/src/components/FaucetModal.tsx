import React, { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits } from 'viem';
import { COLLATERAL_ADDRESS } from '../contracts';
import { useToast } from './Toast';

// Faucet ABI - mint function
const FAUCET_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

type FaucetModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const FAUCET_AMOUNTS = [
  { label: '1,000 oUSD', value: '1000' },
  { label: '5,000 oUSD', value: '5000' },
  { label: '10,000 oUSD', value: '10000' },
];

export default function FaucetModal({ isOpen, onClose }: FaucetModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addToast } = useToast();

  const [selectedAmount, setSelectedAmount] = useState(FAUCET_AMOUNTS[1].value);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleMint() {
    if (!walletClient || !publicClient || !address) return;

    setLoading(true);
    try {
      const amountBigInt = parseUnits(selectedAmount, 18);
      
      const { request } = await publicClient.simulateContract({
        address: COLLATERAL_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'mint',
        args: [address, amountBigInt],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      addToast({
        type: 'info',
        title: 'Faucet request submitted',
        message: 'Minting testnet oUSD...',
        txHash: hash,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      addToast({
        type: 'success',
        title: 'Faucet successful!',
        message: `${selectedAmount} oUSD has been minted to your wallet.`,
      });
      onClose();
    } catch (err: any) {
      // Check if it's an authorization error
      if (err?.message?.includes('OwnableUnauthorizedAccount') || err?.message?.includes('Ownable')) {
        addToast({
          type: 'error',
          title: 'Faucet unavailable',
          message: 'The faucet requires owner permissions. Contact the team for testnet oUSD.',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Faucet failed',
          message: err?.shortMessage || err?.message || 'Unknown error',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🚰 Testnet Faucet</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="muted">
            Get free oUSD testnet tokens to start trading on Sepolia.
          </p>

          <div className="faucet-amounts">
            {FAUCET_AMOUNTS.map((amt) => (
              <button
                key={amt.value}
                className={`faucet-amount-btn ${selectedAmount === amt.value ? 'active' : ''}`}
                onClick={() => setSelectedAmount(amt.value)}
              >
                {amt.label}
              </button>
            ))}
          </div>

          <div className="faucet-info">
            <div className="info-row">
              <span className="label">Network</span>
              <span>Sepolia Testnet</span>
            </div>
            <div className="info-row">
              <span className="label">Token</span>
              <span>oUSD (Obsidian USD)</span>
            </div>
            <div className="info-row">
              <span className="label">Amount</span>
              <span>{selectedAmount} oUSD</span>
            </div>
          </div>

          <div className="modal-info">
            <p className="muted small">
              ⚠️ Note: The faucet may require owner permissions. If minting fails, 
              please contact the team on Discord to receive testnet tokens.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleMint} disabled={loading}>
            {loading ? 'Minting...' : 'Mint oUSD'}
          </button>
        </div>
      </div>
    </div>
  );
}

