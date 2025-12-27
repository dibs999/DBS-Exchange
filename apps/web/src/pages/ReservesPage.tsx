import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import VerifyBalanceModal from '../components/VerifyBalanceModal';

interface ReservesSummary {
    reserves: string;
    liabilities: string;
    ratio: number;
    accounts: number;
    lastUpdate: string;
    merkleRoot: string;
}

interface Attestation {
    merkleRoot: string;
    totalLiabilities: string;
    totalReserves: string;
    accountCount: number;
    timestamp: string;
    blockNumber: number;
}

export default function ReservesPage() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();

    const [summary, setSummary] = useState<ReservesSummary | null>(null);
    const [attestations, setAttestations] = useState<Attestation[]>([]);
    const [loading, setLoading] = useState(true);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);

    useEffect(() => {
        fetchReserves();
        const interval = setInterval(fetchReserves, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    async function fetchReserves() {
        try {
            // In production, this would call the API
            // For now, use mock data
            const mockSummary: ReservesSummary = {
                reserves: '1234567.89',
                liabilities: '1189234.56',
                ratio: 103.81,
                accounts: 1247,
                lastUpdate: new Date().toISOString(),
                merkleRoot: '0x8a3f...b2c1',
            };

            const mockAttestations: Attestation[] = [
                {
                    merkleRoot: '0x8a3f1e2d...b2c1',
                    totalLiabilities: '1189234560000',
                    totalReserves: '1234567890000',
                    accountCount: 1247,
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    blockNumber: 12345678,
                },
                {
                    merkleRoot: '0x7b2e1f3c...a1d2',
                    totalLiabilities: '1156789120000',
                    totalReserves: '1198234560000',
                    accountCount: 1231,
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                    blockNumber: 12345432,
                },
            ];

            setSummary(mockSummary);
            setAttestations(mockAttestations);
        } catch (err) {
            console.error('Failed to fetch reserves:', err);
        } finally {
            setLoading(false);
        }
    }

    function formatNumber(value: string | number, decimals = 2): string {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(num);
    }

    function formatTime(isoString: string): string {
        const date = new Date(isoString);
        return date.toLocaleString();
    }

    function getSolvencyStatus(ratio: number): { text: string; color: string } {
        if (ratio >= 100) return { text: 'Fully Collateralized', color: 'var(--emerald)' };
        if (ratio >= 95) return { text: 'Adequately Collateralized', color: 'var(--gold)' };
        return { text: 'Under-Collateralized', color: 'var(--crimson)' };
    }

    if (loading) {
        return (
            <section className="section">
                <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" />
                    <p className="muted" style={{ marginTop: 16 }}>Loading reserves data...</p>
                </div>
            </section>
        );
    }

    const solvencyStatus = summary ? getSolvencyStatus(summary.ratio) : null;

    return (
        <>
            <section className="section">
                <div className="section-head">
                    <div>
                        <p className="eyebrow">Transparency</p>
                        <h2>Proof of Reserves</h2>
                        <p className="muted">Cryptographically verify that DBS Exchange is fully collateralized</p>
                    </div>
                </div>

                {/* Main Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
                    {/* Total Reserves */}
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                            💰 Total Reserves (USDC)
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--emerald)' }}>
                            ${summary ? formatNumber(summary.reserves) : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            Verified on-chain balance
                        </div>
                    </div>

                    {/* Total Liabilities */}
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                            📊 Total Liabilities
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 'bold' }}>
                            ${summary ? formatNumber(summary.liabilities) : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            Sum of all user balances
                        </div>
                    </div>

                    {/* Solvency Ratio */}
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                            ✅ Solvency Ratio
                        </div>
                        <div style={{
                            fontSize: 32,
                            fontWeight: 'bold',
                            color: solvencyStatus?.color || 'var(--text)'
                        }}>
                            {summary ? `${summary.ratio.toFixed(2)}%` : '—'}
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: solvencyStatus?.color || 'var(--muted)',
                            marginTop: 8,
                            fontWeight: 500
                        }}>
                            {solvencyStatus?.text || '—'}
                        </div>
                    </div>

                    {/* Account Count */}
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                            👥 Accounts Included
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 'bold' }}>
                            {summary ? formatNumber(summary.accounts, 0) : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                            In current Merkle tree
                        </div>
                    </div>
                </div>

                {/* Merkle Root Section */}
                <div className="panel" style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 24 }}>
                        <div>
                            <h3 style={{ margin: 0 }}>🌳 Current Merkle Root</h3>
                            <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                                On-chain commitment to all user balances
                            </p>
                        </div>
                        <button
                            className="btn primary"
                            onClick={() => setVerifyModalOpen(true)}
                            disabled={!isConnected}
                        >
                            🔍 Verify My Balance
                        </button>
                    </div>
                    <div style={{
                        padding: '16px 24px',
                        background: 'var(--bg-1)',
                        borderTop: '1px solid var(--stroke)',
                        fontFamily: 'monospace',
                        fontSize: 14,
                        wordBreak: 'break-all'
                    }}>
                        {summary?.merkleRoot || '0x0000...0000'}
                    </div>
                    <div style={{
                        padding: '12px 24px',
                        background: 'var(--bg-0)',
                        fontSize: 12,
                        color: 'var(--muted)',
                        display: 'flex',
                        justifyContent: 'space-between'
                    }}>
                        <span>Last Updated: {summary ? formatTime(summary.lastUpdate) : '—'}</span>
                        <a
                            href="#"
                            style={{ color: 'var(--gold)' }}
                            onClick={(e) => { e.preventDefault(); /* Open block explorer */ }}
                        >
                            View on Block Explorer →
                        </a>
                    </div>
                </div>

                {/* How It Works */}
                <div className="panel" style={{ marginBottom: 32 }}>
                    <h3 style={{ padding: '24px 24px 0' }}>🔐 How It Works</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, padding: 24 }}>
                        <div>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>1️⃣</div>
                            <h4 style={{ margin: '0 0 8px' }}>Balance Collection</h4>
                            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                                Every hour, we collect all user collateral balances from the PerpEngine contract.
                            </p>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>2️⃣</div>
                            <h4 style={{ margin: '0 0 8px' }}>Merkle Tree</h4>
                            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                                Balances are hashed and organized into a Merkle tree. The root hash commits to all balances.
                            </p>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>3️⃣</div>
                            <h4 style={{ margin: '0 0 8px' }}>On-Chain Anchor</h4>
                            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                                The Merkle root is published on-chain, creating an immutable, timestamped record.
                            </p>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>4️⃣</div>
                            <h4 style={{ margin: '0 0 8px' }}>User Verification</h4>
                            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                                Any user can verify their balance is included using a Merkle proof—no trust required.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Historical Attestations */}
                <div className="panel">
                    <h3 style={{ padding: '24px 24px 16px' }}>📜 Attestation History</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--stroke)' }}>
                                    <th style={{ textAlign: 'left', padding: '12px 24px', fontSize: 12, color: 'var(--muted)' }}>Timestamp</th>
                                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>Merkle Root</th>
                                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>Reserves</th>
                                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>Liabilities</th>
                                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>Accounts</th>
                                    <th style={{ textAlign: 'right', padding: '12px 24px', fontSize: 12, color: 'var(--muted)' }}>Block</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attestations.map((att, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--stroke)' }}>
                                        <td style={{ padding: '12px 24px', fontSize: 13 }}>{formatTime(att.timestamp)}</td>
                                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12 }}>
                                            {att.merkleRoot.slice(0, 10)}...{att.merkleRoot.slice(-4)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13 }}>
                                            ${formatNumber(parseFloat(att.totalReserves) / 1e6)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13 }}>
                                            ${formatNumber(parseFloat(att.totalLiabilities) / 1e18)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13 }}>
                                            {att.accountCount}
                                        </td>
                                        <td style={{ padding: '12px 24px', textAlign: 'right', fontSize: 13 }}>
                                            <a href="#" style={{ color: 'var(--gold)' }}>#{att.blockNumber}</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <VerifyBalanceModal
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                merkleRoot={summary?.merkleRoot || ''}
            />
        </>
    );
}
