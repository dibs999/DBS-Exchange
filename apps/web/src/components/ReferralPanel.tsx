import React, { useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from './Toast';
import { formatUsd } from '../lib/format';

type ReferralStats = {
    referralCode: string;
    referralLink: string;
    referredUsers: number;
    totalVolume: number;
    pendingRewards: number;
    claimedRewards: number;
    tier: 'bronze' | 'silver' | 'gold' | 'diamond';
};

const TIERS = {
    bronze: { minReferrals: 0, rebate: 10, color: '#cd7f32' },
    silver: { minReferrals: 5, rebate: 15, color: '#c0c0c0' },
    gold: { minReferrals: 20, rebate: 20, color: '#ffd700' },
    diamond: { minReferrals: 50, rebate: 25, color: '#b9f2ff' },
};

export default function ReferralPanel() {
    const { address, isConnected } = useAccount();
    const { addToast } = useToast();
    const [claimLoading, setClaimLoading] = useState(false);

    // Mock referral stats - in production, fetch from API
    const stats: ReferralStats = useMemo(() => {
        if (!address) return {
            referralCode: '',
            referralLink: '',
            referredUsers: 0,
            totalVolume: 0,
            pendingRewards: 0,
            claimedRewards: 0,
            tier: 'bronze' as const,
        };

        const code = address.slice(2, 8).toUpperCase();
        return {
            referralCode: code,
            referralLink: `${window.location.origin}?ref=${code}`,
            referredUsers: Math.floor(Math.random() * 15),
            totalVolume: Math.random() * 500000,
            pendingRewards: Math.random() * 500,
            claimedRewards: Math.random() * 2000,
            tier: 'silver' as const,
        };
    }, [address]);

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            addToast({ type: 'success', title: 'Copied!', message: `${label} copied to clipboard` });
        } catch {
            addToast({ type: 'error', title: 'Failed', message: 'Could not copy to clipboard' });
        }
    };

    const handleClaim = async () => {
        if (stats.pendingRewards <= 0) return;
        setClaimLoading(true);

        // Simulate claim
        await new Promise(r => setTimeout(r, 1500));

        addToast({
            type: 'success',
            title: 'Rewards Claimed!',
            message: `${formatUsd(stats.pendingRewards, 2)} has been added to your balance`
        });
        setClaimLoading(false);
    };

    if (!isConnected) {
        return (
            <div className="panel referral-panel">
                <div className="panel-header">
                    <h3>🔗 Referral Program</h3>
                </div>
                <div style={{ padding: 24, textAlign: 'center' }}>
                    <p className="muted">Connect your wallet to access your referral link and rewards.</p>
                </div>
            </div>
        );
    }

    const tierInfo = TIERS[stats.tier];

    return (
        <div className="panel referral-panel">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Earn rewards</p>
                    <h3>🔗 Referral Program</h3>
                </div>
                <div className="tier-badge" style={{
                    background: tierInfo.color,
                    color: '#000',
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    fontSize: 12,
                }}>
                    {stats.tier} • {tierInfo.rebate}% Rebate
                </div>
            </div>

            {/* Referral Link */}
            <div className="referral-link-section" style={{ margin: '16px 0', padding: 16, background: '#111', borderRadius: 8 }}>
                <label className="small muted">Your Referral Link</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                        type="text"
                        value={stats.referralLink}
                        readOnly
                        style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <button
                        className="btn primary"
                        onClick={() => copyToClipboard(stats.referralLink, 'Referral link')}
                    >
                        Copy
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span className="small muted">Code: <strong>{stats.referralCode}</strong></span>
                    <button
                        className="btn ghost small"
                        onClick={() => copyToClipboard(stats.referralCode, 'Referral code')}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                    >
                        Copy Code
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="referral-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                <div className="stat-card" style={{ padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
                    <span className="small muted">Referred Users</span>
                    <strong style={{ display: 'block', fontSize: 20 }}>{stats.referredUsers}</strong>
                </div>
                <div className="stat-card" style={{ padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
                    <span className="small muted">Total Volume</span>
                    <strong style={{ display: 'block', fontSize: 20 }}>{formatUsd(stats.totalVolume, 0)}</strong>
                </div>
                <div className="stat-card" style={{ padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
                    <span className="small muted">Pending Rewards</span>
                    <strong style={{ display: 'block', fontSize: 20 }} className="text-positive">{formatUsd(stats.pendingRewards, 2)}</strong>
                </div>
                <div className="stat-card" style={{ padding: 12, background: '#0a0a0a', borderRadius: 8 }}>
                    <span className="small muted">Total Earned</span>
                    <strong style={{ display: 'block', fontSize: 20 }}>{formatUsd(stats.claimedRewards + stats.pendingRewards, 2)}</strong>
                </div>
            </div>

            {/* Claim Button */}
            {stats.pendingRewards > 0 && (
                <button
                    className="btn primary"
                    style={{ width: '100%' }}
                    onClick={handleClaim}
                    disabled={claimLoading}
                >
                    {claimLoading ? 'Claiming...' : `Claim ${formatUsd(stats.pendingRewards, 2)} Rewards`}
                </button>
            )}

            {/* Tier Progress */}
            <div className="tier-progress" style={{ marginTop: 16, padding: 12, background: '#111', borderRadius: 8 }}>
                <p className="small muted" style={{ marginBottom: 8 }}>Tier Progress</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    {Object.entries(TIERS).map(([tier, info]) => (
                        <div key={tier} style={{ textAlign: 'center', opacity: stats.tier === tier ? 1 : 0.5 }}>
                            <div style={{ color: info.color, fontWeight: 'bold' }}>{tier.toUpperCase()}</div>
                            <div className="muted">{info.rebate}%</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
