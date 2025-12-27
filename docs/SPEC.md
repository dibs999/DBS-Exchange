# Protocol Spec (Draft)

This document captures the target architecture and parameters for the on-chain
Perps DEX build (hybrid matching, L2, LP vault). It is a living spec that will
evolve with implementation.

## Scope

- Matching model: fully on-chain hybrid (continuous matching + batch auction)
- L2 targets: Arbitrum, Optimism, Base (EVM)
- Collateral: USDC (6 decimals), internal accounting uses 1e18 scaling
- Margin: cross-margin (single collateral balance across markets)
- Max leverage: 10x initial (per-market configurable)
- LP vault: active liquidity + insurance backstop + fee distribution

## Core Modules

### 1) OrderbookV2 (On-chain CLOB)

- Price-time priority at discrete price ticks.
- Two matching modes:
  - Continuous: taker matches immediately against best resting orders.
  - Batch auction: periodic matching at a clearing price for queued orders.
- Resting orders are stored in per-price FIFO queues.
- Active price buckets are tracked via a linked list per side.

Key actions:
- placeOrder (limit/market/stop)
- cancelOrder
- match (continuous taker)
- executeAuction (batch)

Batch auction (high level):
- Aggregate demand/supply across price buckets.
- Compute clearing price (max matched volume).
- Settle all matched orders at clearing price.
- Unmatched residual can be routed to LP Vault (optional, if enabled).

### 2) PerpEngineV2 (Risk + Positions)

- Cross-margin account model.
- Position per market: size, entryPrice, fundingEntry.
- Realized PnL on reduce/close.
- Funding accrues continuously via cumulativeFundingRate.

Key actions:
- deposit/withdraw (USDC)
- open/close/update position (called by OrderbookV2 during settlement)
- liquidate (partial allowed)

### 3) Vault (LP + Insurance Backstop)

- USDC deposits, shares, utilization constraints.
- Earns trading fees and funding flows.
- Can act as residual counterparty at auction clearing price.
- Pays for socialized losses when liquidation is insufficient.

### 4) InsuranceFund

- Receives protocol fee share.
- Covers shortfall on liquidations.
- Triggers ADL rules when below thresholds.

### 5) OracleRouter

- Aggregates index prices (multi-source).
- Supports TWAP/staleness/deviation guards.
- Exposes indexPrice + lastUpdated.

## Matching Design (Hybrid)

Continuous matching:
- Taker order sweeps the best price buckets (best bid/ask first).
- Partial fills allowed; remaining size becomes resting order (if limit).

Batch auction:
- Orders enter batch queues for the market.
- executeAuction computes clearing price based on aggregated curves.
- Settlement at a single price per batch (reduces MEV and gas).

Fairness:
- Price-time priority enforced per price bucket.
- Auction batch uses deterministic order of fills (FIFO within bucket).

## Funding Model (Default)

- Index price from OracleRouter.
- Mark price derived from orderbook mid or last trade, clamped by index.
- Premium = (mark - index) / index.
- Funding rate = clamp(premium, +/- maxFundingRate).
- Funding interval: 1 hour; rate stored as per-second for accumulation.

Defaults:
- maxFundingRate = 0.01% per hour (tunable).

## Fees (Default)

Maker/Taker model:
- makerFeeBps = 1
- takerFeeBps = 6

Fee split:
- 70% LP Vault
- 25% Insurance Fund
- 5% Treasury

All fees are configurable by governance.

## Risk Parameters (Default)

- Max leverage: 10x (per market).
- Initial margin: 10% (per market).
- Maintenance margin: 5% (per market).
- OI caps (per market): 50M USDC (tunable).
- Per-account exposure cap: 5M USDC (tunable).
- Max price age: 60s (oracle staleness guard).

## Liquidations

- Partial liquidations allowed.
- Liquidation fee: 0.5% (tunable).
- If collateral < deficit, InsuranceFund pays.
- If InsuranceFund below threshold, ADL is activated.

## Governance

- Multisig (Safe) as owner.
- Timelock for critical parameters (48h default).
- Upgradeability: UUPS (ability to freeze upgrades later).
- Pausable for emergency shutdown.

## Event Schema (Key)

- OrderPlaced, OrderCancelled, OrderMatched
- AuctionExecuted (clearing price, volume)
- PositionOpened/Updated/Closed
- FundingRateUpdated
- LiquidationExecuted
- VaultDeposit/VaultWithdraw/FeesDistributed

## Network Targets

- Arbitrum (primary dev/test)
- Optimism
- Base

Deployment scripts should support all three networks with shared configs.
