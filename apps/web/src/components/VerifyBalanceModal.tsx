import { useState } from 'react';
import { useAccount } from 'wagmi';
import { keccak256, encodePacked, type Address } from 'viem';

interface VerifyBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    merkleRoot: string;
}

interface ProofResponse {
    address: string;
    balance: string;
    proof: string[];
    leafIndex: number;
    leaf: string;
}

export default function VerifyBalanceModal({ isOpen, onClose, merkleRoot }: VerifyBalanceModalProps) {
    const { address } = useAccount();
    const [loading, setLoading] = useState(false);
    const [proofData, setProofData] = useState<ProofResponse | null>(null);
    const [verified, setVerified] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    async function fetchAndVerify() {
        if (!address) return;

        setLoading(true);
        setError(null);
        setVerified(null);

        try {
            // In production, fetch from API
            // const response = await fetch(`/api/reserves/proof/${address}`);
            // const data = await response.json();

            // Mock proof data for demo
            const mockProof: ProofResponse = {
                address: address,
                balance: '1000000000000000000000', // 1000 in 1e18
                proof: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
                    '0x567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
                ],
                leafIndex: 42,
                leaf: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
            };

            setProofData(mockProof);

            // Verify the proof
            const isValid = verifyMerkleProof(
                merkleRoot,
                mockProof.address as Address,
                BigInt(mockProof.balance),
                mockProof.proof
            );

            setVerified(isValid);
        } catch (err) {
            console.error('Verification failed:', err);
            setError('Failed to fetch proof. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    function verifyMerkleProof(
        root: string,
        account: Address,
        balance: bigint,
        proof: string[]
    ): boolean {
        // Compute leaf hash
        let computedHash = keccak256(encodePacked(['address', 'uint256'], [account, balance]));

        // Traverse the proof
        for (const proofElement of proof) {
            const [first, second] = computedHash <= proofElement
                ? [computedHash, proofElement]
                : [proofElement, computedHash];

            computedHash = keccak256(encodePacked(['bytes32', 'bytes32'], [first as `0x${string}`, second as `0x${string}`]));
        }

        return computedHash === root;
    }

    function formatBalance(balance: string): string {
        const value = parseFloat(balance) / 1e18;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                <div className="modal-header">
                    <h2>🔍 Verify Your Balance</h2>
                    <button className="btn ghost" onClick={onClose}>✕</button>
                </div>

                <div className="modal-content" style={{ padding: 24 }}>
                    {!address ? (
                        <div style={{ textAlign: 'center', padding: 32 }}>
                            <p className="muted">Please connect your wallet to verify your balance.</p>
                        </div>
                    ) : !proofData ? (
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ marginBottom: 16 }}>
                                Click below to fetch your Merkle proof and verify your balance is included in the reserves attestation.
                            </p>
                            <div style={{
                                background: 'var(--bg-1)',
                                padding: 16,
                                borderRadius: 8,
                                marginBottom: 24,
                                fontFamily: 'monospace',
                                fontSize: 13
                            }}>
                                <span className="muted">Your address:</span><br />
                                {address}
                            </div>
                            <button
                                className="btn primary"
                                onClick={fetchAndVerify}
                                disabled={loading}
                                style={{ width: '100%' }}
                            >
                                {loading ? 'Fetching Proof...' : '🔐 Fetch & Verify Proof'}
                            </button>
                            {error && (
                                <p style={{ color: 'var(--crimson)', marginTop: 16 }}>{error}</p>
                            )}
                        </div>
                    ) : (
                        <div>
                            {/* Verification Result */}
                            <div style={{
                                background: verified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${verified ? 'var(--emerald)' : 'var(--crimson)'}`,
                                borderRadius: 12,
                                padding: 24,
                                textAlign: 'center',
                                marginBottom: 24
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 8 }}>
                                    {verified ? '✅' : '❌'}
                                </div>
                                <h3 style={{
                                    margin: '0 0 8px',
                                    color: verified ? 'var(--emerald)' : 'var(--crimson)'
                                }}>
                                    {verified ? 'Verification Successful!' : 'Verification Failed'}
                                </h3>
                                <p className="muted" style={{ margin: 0 }}>
                                    {verified
                                        ? 'Your balance is cryptographically proven to be included in the reserves.'
                                        : 'The proof could not be verified against the current Merkle root.'}
                                </p>
                            </div>

                            {/* Balance Info */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 16,
                                marginBottom: 24
                            }}>
                                <div className="panel" style={{ padding: 16 }}>
                                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Your Balance</div>
                                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                                        ${formatBalance(proofData.balance)} USDC
                                    </div>
                                </div>
                                <div className="panel" style={{ padding: 16 }}>
                                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Leaf Index</div>
                                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                                        #{proofData.leafIndex}
                                    </div>
                                </div>
                            </div>

                            {/* Technical Details */}
                            <details style={{ marginBottom: 16 }}>
                                <summary style={{
                                    cursor: 'pointer',
                                    padding: 12,
                                    background: 'var(--bg-1)',
                                    borderRadius: 8,
                                    fontSize: 14
                                }}>
                                    📄 Technical Details (click to expand)
                                </summary>
                                <div style={{
                                    padding: 16,
                                    background: 'var(--bg-0)',
                                    borderRadius: '0 0 8px 8px',
                                    fontSize: 12,
                                    fontFamily: 'monospace'
                                }}>
                                    <div style={{ marginBottom: 12 }}>
                                        <strong>Leaf Hash:</strong>
                                        <div style={{ wordBreak: 'break-all', marginTop: 4, color: 'var(--muted)' }}>
                                            {proofData.leaf}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <strong>Merkle Root:</strong>
                                        <div style={{ wordBreak: 'break-all', marginTop: 4, color: 'var(--muted)' }}>
                                            {merkleRoot}
                                        </div>
                                    </div>
                                    <div>
                                        <strong>Proof ({proofData.proof.length} elements):</strong>
                                        <div style={{ marginTop: 8 }}>
                                            {proofData.proof.map((hash, idx) => (
                                                <div key={idx} style={{
                                                    padding: 8,
                                                    background: 'var(--bg-1)',
                                                    borderRadius: 4,
                                                    marginBottom: 4,
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <span style={{ color: 'var(--muted)' }}>
                                                        [{idx}] {hash.slice(0, 20)}...{hash.slice(-8)}
                                                    </span>
                                                    <button
                                                        className="btn ghost"
                                                        style={{ padding: '4px 8px', fontSize: 10 }}
                                                        onClick={() => copyToClipboard(hash)}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </details>

                            <button
                                className="btn ghost"
                                onClick={() => { setProofData(null); setVerified(null); }}
                                style={{ width: '100%' }}
                            >
                                ← Verify Another Address
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
