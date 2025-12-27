import React from 'react';
import { useAccount } from 'wagmi';
import ReferralPanel from '../components/ReferralPanel';
import WalletButton from '../components/WalletButton';

export default function ReferralPage() {
    const { isConnected } = useAccount();

    return (
        <>
            <section className="section">
                <div className="section-head">
                    <div>
                        <p className="eyebrow">Earn rewards</p>
                        <h2>Referral Program</h2>
                        <p className="muted">
                            Invite friends to trade on DBS Exchange and earn a percentage of their trading fees.
                        </p>
                    </div>
                </div>

                {/* How it works */}
                <div className="referral-explainer" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 32 }}>
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
                        <h4>1. Get Your Link</h4>
                        <p className="muted small">Connect your wallet to generate a unique referral link.</p>
                    </div>
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                        <h4>2. Share It</h4>
                        <p className="muted small">Share your link with friends, on social media, or in your community.</p>
                    </div>
                    <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
                        <h4>3. Earn Rewards</h4>
                        <p className="muted small">Earn up to 25% of trading fees from referred users forever.</p>
                    </div>
                </div>

                {/* Referral Panel or Connect Prompt */}
                {isConnected ? (
                    <ReferralPanel />
                ) : (
                    <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
                        <h3>Connect Wallet to Start</h3>
                        <p className="muted" style={{ marginBottom: 24 }}>
                            Connect your wallet to get your unique referral link and start earning rewards.
                        </p>
                        <WalletButton />
                    </div>
                )}

                {/* Tier Table */}
                <div className="panel" style={{ marginTop: 32, padding: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>Reward Tiers</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #333' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px' }}>Tier</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Referrals Required</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Fee Rebate</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Referred User Discount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '12px 8px' }}><span style={{ color: '#cd7f32' }}>🥉 Bronze</span></td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>0+</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>10%</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>5%</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '12px 8px' }}><span style={{ color: '#c0c0c0' }}>🥈 Silver</span></td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>5+</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>15%</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>5%</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '12px 8px' }}><span style={{ color: '#ffd700' }}>🥇 Gold</span></td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>20+</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>20%</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>10%</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '12px 8px' }}><span style={{ color: '#b9f2ff' }}>💎 Diamond</span></td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>50+</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>25%</td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>10%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}
