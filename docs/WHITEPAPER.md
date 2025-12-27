# DBS Exchange

## Technical Whitepaper v2.0

**A Decentralized Perpetual Futures Exchange on Base L2**

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Smart Contracts](#3-smart-contracts)
4. [Trading Mechanics](#4-trading-mechanics)
5. [Risk Management](#5-risk-management)
6. [Orderbook & Matching](#6-orderbook--matching)
7. [Oracle System](#7-oracle-system)
8. [Vault & Insurance Fund](#8-vault--insurance-fund)
9. [Proof of Reserves](#9-proof-of-reserves)
10. [Backend Infrastructure](#10-backend-infrastructure)
11. [Frontend Application](#11-frontend-application)
12. [Security](#12-security)
13. [Scalability](#13-scalability)
14. [Deployment](#14-deployment)
15. [Tokenomics](#15-tokenomics)
16. [Roadmap](#16-roadmap)

---

# 1. Executive Summary

DBS Exchange is a fully on-chain decentralized perpetual futures exchange deployed on Base L2. It combines the capital efficiency of centralized exchanges with the transparency and security of decentralized finance.

## Key Features

| Feature | Description |
|---------|-------------|
| **On-Chain Matching** | Hybrid continuous + batch auction order matching |
| **Cross-Margin** | Single collateral (USDC) across all positions |
| **Perpetual Futures** | No expiry, funding rate alignment to spot |
| **Liquidation Engine** | Partial liquidations with insurance backstop |
| **Auto-Deleveraging (ADL)** | Fallback when insurance depleted |
| **LP Vault** | Liquidity providers earn fees as counterparty |
| **Proof of Reserves** | Merkle tree-based balance verification |

## Technology Stack

- **Blockchain**: Base L2 (Ethereum Layer 2)
- **Smart Contracts**: Solidity 0.8.23, UUPS Upgradeable
- **Backend**: Node.js, Fastify, PostgreSQL, Redis
- **Frontend**: React, Vite, Wagmi, TradingView

---

# 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Trade     │  │  Portfolio  │  │   Vault     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket / REST
┌────────────────────────────┼────────────────────────────────────┐
│                        API LAYER                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Fastify   │  │  WebSocket  │  │   Indexer   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────────────── KEEPERS ──────────────────────────┐   │
│  │ Liquidation │ Funding │ Orderbook │ Oracle │ Reserves │   │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ RPC
┌────────────────────────────┼────────────────────────────────────┐
│                    SMART CONTRACTS (Base L2)                    │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                   │
│  │  PerpEngineV2   │◄────►│  OrderbookV2    │                   │
│  │  (Positions)    │      │  (Matching)     │                   │
│  └────────┬────────┘      └────────┬────────┘                   │
│           │                        │                            │
│  ┌────────▼────────┐      ┌────────▼────────┐                   │
│  │  OracleRouter   │      │     Vault       │                   │
│  │  (Price Feeds)  │      │  (LP Shares)    │                   │
│  └─────────────────┘      └─────────────────┘                   │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                   │
│  │ InsuranceFund   │      │ProofOfReserves  │                   │
│  │  (Backstop)     │      │ (Transparency)  │                   │
│  └─────────────────┘      └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

# 3. Smart Contracts

## 3.1 PerpEngineV2 (Core Trading Engine)

**Purpose**: Manages positions, collateral, margin, funding, and liquidations.

### Key Functions

| Function | Description |
|----------|-------------|
| `deposit(amount)` | Deposit USDC collateral |
| `withdraw(amount)` | Withdraw available collateral |
| `applyTrade(fill)` | Execute trade from Orderbook |
| `liquidate(account, marketId, size)` | Liquidate undercollateralized position |
| `adlClose(account, marketId, size)` | Auto-deleverage profitable position |

### Data Structures

```solidity
struct Market {
    bool active;
    uint256 initialMarginBps;      // e.g., 500 = 5% = 20x max leverage
    uint256 maintenanceMarginBps;  // e.g., 300 = 3%
    uint256 maxLeverage;           // e.g., 50
    uint256 maxOpenInterest;       // OI cap in 1e18
    uint256 maxAccountExposure;    // Per-account cap
    uint256 openInterest;
    uint256 longSize;
    uint256 shortSize;
    int256 cumulativeFundingRate;
    int256 fundingRatePerSecond;
    uint256 lastFundingTime;
    uint256 maxFundingRateBps;
}

struct Position {
    int256 size;           // Positive = long, negative = short
    uint256 entryPrice;    // Weighted average entry
    int256 fundingEntry;   // Cumulative funding at entry
}
```

### Events

- `PositionOpened(account, marketId, size, entryPrice)`
- `PositionUpdated(account, marketId, size, entryPrice, realizedPnl)`
- `PositionClosed(account, marketId, size, exitPrice, pnl)`
- `LiquidationExecuted(account, liquidator, marketId, closeSize, price, pnl, penalty)`

---

## 3.2 OrderbookV2 (Order Matching)

**Purpose**: On-chain limit order book with continuous matching and batch auctions.

### Order Types

| Type | Description |
|------|-------------|
| `Market` | Execute immediately at best price |
| `Limit` | Execute at specified price or better |
| `Stop` | Trigger when price reaches threshold |

### Order Modes

| Mode | Description |
|------|-------------|
| `Normal` | Standard order |
| `ReduceOnly` | Only reduce existing position |
| `PostOnly` | Only add liquidity, no taker fills |

### Matching Modes

1. **Continuous Matching**: Orders execute immediately against resting liquidity
2. **Batch Auction**: Orders queue until periodic clearing (MEV protection)

### Key Functions

| Function | Description |
|----------|-------------|
| `placeOrder(...)` | Submit new order |
| `cancelOrder(orderId)` | Cancel pending order |
| `triggerStopOrder(orderId)` | Keeper triggers stop order |
| `executeAuction(marketId)` | Keeper executes batch auction |

---

## 3.3 OracleRouter (Price Feeds)

**Purpose**: Aggregates price data from multiple sources with staleness protection.

### Features

- Multi-source price aggregation
- `maxPriceAge` staleness check
- `maxDeviation` sanity check
- Keeper-updated prices (Pyth/Chainlink compatible)

### Key Functions

| Function | Description |
|----------|-------------|
| `updatePrice(marketId, price)` | Keeper updates price |
| `getPriceData(marketId)` | Returns (price, updatedAt) |

---

## 3.4 Vault (LP Shares)

**Purpose**: ERC20 vault for liquidity providers to earn trading fees.

### Mechanics

- Deposit USDC → Receive LP shares
- Share price increases from trading fees
- Optional engine allocation for counterparty trading

### Key Functions

| Function | Description |
|----------|-------------|
| `deposit(assets)` | Deposit USDC, receive shares |
| `withdraw(shares)` | Redeem shares for USDC |
| `totalAssets()` | Total USDC under management |

---

## 3.5 InsuranceFund

**Purpose**: Backstop for socialized losses during liquidations.

### Flow

1. Trading fees partially flow to Insurance Fund
2. Liquidation deficits covered by Insurance Fund
3. If depleted → ADL (Auto-Deleveraging) activates

---

## 3.6 ProofOfReserves

**Purpose**: Merkle tree-based transparency for user balance verification.

### Key Functions

| Function | Description |
|----------|-------------|
| `updateMerkleRoot(root, liabilities, count)` | Keeper updates attestation |
| `verifyInclusion(account, balance, proof)` | User verifies their balance |
| `getSolvencyRatio()` | Returns reserves/liabilities ratio |

---

# 4. Trading Mechanics

## 4.1 Opening a Position

1. User deposits USDC to PerpEngine
2. User approves Orderbook as operator
3. User places order (Market/Limit/Stop)
4. Orderbook matches order, calls `Engine.applyTrade()`
5. Position created/updated in Engine

## 4.2 Position Accounting

```
PnL = (currentPrice - entryPrice) × size
Margin = collateralBalance
Equity = Margin + UnrealizedPnL
LiquidationPrice = entryPrice × (1 - maintenanceMargin/leverage)  [for longs]
```

## 4.3 Funding Rate

Funding aligns perpetual price to spot index:

- **Longs pay shorts** when mark > index (premium)
- **Shorts pay longs** when mark < index (discount)
- Rate calculated from long/short imbalance
- Applied continuously, compounded every second

```
FundingPayment = size × (cumulativeFunding - fundingEntry)
```

---

# 5. Risk Management

## 5.1 Margin Requirements

| Parameter | Description | Example |
|-----------|-------------|---------|
| Initial Margin | Required to open position | 5% (20x) |
| Maintenance Margin | Required to avoid liquidation | 3% |
| Max Leverage | Maximum allowed leverage | 50x |

## 5.2 Liquidation

Triggered when:
```
Equity < MaintenanceMarginRequired
```

Process:
1. Keeper calls `liquidate(account, marketId, size)`
2. Position partially or fully closed at oracle price
3. Liquidation fee (1%) paid to liquidator
4. Deficit (if any) covered by Insurance Fund

## 5.3 Auto-Deleveraging (ADL)

When Insurance Fund is depleted:
1. ADL flag enabled
2. Profitable counter-positions selected
3. Forcibly closed to cover losses
4. Prioritized by profitability

## 5.4 Exposure Caps

| Cap | Purpose |
|-----|---------|
| `maxOpenInterest` | Total market OI limit |
| `maxAccountExposure` | Per-account notional limit |
| Slippage Protection | 5% max deviation from oracle |

---

# 6. Orderbook & Matching

## 6.1 Price Levels

Orders organized by price in tick-based levels:
- Bid levels: Sorted descending (highest first)
- Ask levels: Sorted ascending (lowest first)
- FIFO within each level

## 6.2 Continuous Matching

```
1. Taker order arrives
2. Match against best opposing level
3. Fill partially or completely
4. Update order status
5. Settle via Engine.applyTrade()
```

## 6.3 Batch Auction

MEV-resistant matching:
1. Orders queue during cooldown period
2. Keeper calls `executeAuction(marketId)`
3. Clearing price determined (max matched volume)
4. All orders at clearing price execute atomically
5. Residual imbalance optionally filled by Vault

---

# 7. Oracle System

## 7.1 Price Sources

- **Pyth Network** (primary, recommended)
- **Chainlink** (backup)
- **Custom keepers** (for testing)

## 7.2 Staleness Protection

```solidity
require(block.timestamp - updatedAt <= maxPriceAge, "Stale price");
```

## 7.3 Deviation Check

```solidity
require(slippageBps <= 500, "Price deviation too high"); // 5% max
```

---

# 8. Vault & Insurance Fund

## 8.1 Fee Distribution

Trading fees split:

| Recipient | Share |
|-----------|-------|
| Vault (LPs) | 70% |
| Insurance Fund | 25% |
| Treasury | 5% |

## 8.2 Vault Mechanics

- ERC20 shares (similar to ERC4626)
- Share price = totalAssets / totalSupply
- Assets grow from fee accumulation

## 8.3 Insurance Mechanics

- Funded by trading fees
- Covers liquidation deficits
- Threshold triggers ADL when low

---

# 9. Proof of Reserves

## 9.1 Concept

Cryptographic proof that exchange reserves ≥ user liabilities.

## 9.2 Implementation

1. **Keeper** collects all user balances from contract
2. **Merkle tree** built: `leaf = keccak256(address, balance)`
3. **Root** stored on-chain in ProofOfReserves contract
4. **Users** can fetch proof and verify inclusion

## 9.3 Solvency Ratio

```
Ratio = TotalReserves / TotalLiabilities × 100%
```

- ≥ 100%: Fully collateralized
- < 100%: Under-collateralized (should never happen)

---

# 10. Backend Infrastructure

## 10.1 Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| API Server | Fastify | REST endpoints |
| WebSocket | @fastify/websocket | Real-time streams |
| Database | PostgreSQL | Event indexing |
| Cache | Redis | Response caching, Pub/Sub |
| Keepers | Node.js | Automated contract calls |

## 10.2 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/markets` | GET | All markets |
| `/prices` | GET | Current prices |
| `/orderbook/:marketId` | GET | Order book depth |
| `/trades/:marketId` | GET | Recent trades |
| `/positions/:address` | GET | User positions |
| `/orders` | GET | User orders |
| `/reserves` | GET | Proof of Reserves data |
| `/ws` | WebSocket | Real-time stream |

## 10.3 Keepers

| Keeper | Interval | Function |
|--------|----------|----------|
| Liquidation | 15s | Check and liquidate positions |
| Funding | 1h | Update funding rates |
| Orderbook | 10s | Execute triggered orders |
| Auction | 1m | Execute batch auctions |
| Oracle | 30s | Update prices |
| Reserves | 1h | Build Merkle tree |

## 10.4 Indexer

- Subscribes to contract events via RPC
- Persists to PostgreSQL
- Enables historical queries

---

# 11. Frontend Application

## 11.1 Pages

| Page | Features |
|------|----------|
| Trade | Chart, order entry, positions, orderbook |
| Markets | All available markets |
| Portfolio | Positions, orders, history |
| Vault | Deposit/withdraw LP shares |
| Analytics | Volume, fees, stats |
| Leaderboard | Top traders by PnL |
| Reserves | Proof of reserves, verification |

## 11.2 Features

- **LightweightCharts**: Performance-optimized charting
- **One-Click Trading**: Configurable quick trades
- **TP/SL Orders**: Take profit and stop loss
- **Theme Toggle**: Dark/light modes
- **Notifications**: Trade alerts
- **PWA**: Mobile installable

---

# 12. Security

## 12.1 Smart Contract Security

| Measure | Implementation |
|---------|----------------|
| Reentrancy Protection | `ReentrancyGuard` on all state-changing functions |
| Access Control | `Ownable`, keeper whitelists |
| Input Validation | Size/price/margin checks |
| Upgradability | UUPS pattern with owner control |
| Pausability | Emergency pause mechanism |

## 12.2 API Security

| Measure | Implementation |
|---------|----------------|
| Rate Limiting | 100 req/s per IP via Nginx |
| CORS | Whitelisted origins |
| Input Validation | Schema validation |
| DDoS Protection | Cloudflare (recommended) |

## 12.3 Recommendations

- [ ] Professional security audit before mainnet
- [ ] Bug bounty program
- [ ] Timelock for admin functions
- [ ] Multi-sig for owner keys

---

# 13. Scalability

## 13.1 Current Capacity

| Metric | Capacity |
|--------|----------|
| DB Connections | 100 (pool) |
| API Instances | N (horizontally scalable) |
| WebSocket | Redis Pub/Sub |
| Requests/sec | ~10,000+ |

## 13.2 Horizontal Scaling

```bash
docker-compose -f docker-compose.scale.yml up --scale api=5
```

## 13.3 Infrastructure

- **Nginx**: Load balancer with sticky sessions for WebSocket
- **Redis**: Pub/Sub for broadcast, caching for responses
- **PgBouncer**: Connection pooling for PostgreSQL

---

# 14. Deployment

## 14.1 Contracts (Base Mainnet)

```bash
cd packages/contracts
pnpm deploy:base
```

Deployment order:
1. CollateralToken (or use existing USDC)
2. OracleRouter
3. PerpEngineV2
4. OrderbookV2
5. Vault
6. InsuranceFund
7. ProofOfReserves

## 14.2 Backend

```bash
# Environment
export DATABASE_URL=postgres://...
export REDIS_URL=redis://...
export BASE_RPC_URL=https://...
export KEEPER_PRIVATE_KEY=0x...

# Deploy
docker-compose -f docker-compose.scale.yml up -d
```

## 14.3 Frontend

```bash
cd apps/web
vercel --prod
```

---

# 15. Tokenomics

## 15.1 Current Model (No Token)

- Fees in USDC
- No governance token in MVP
- Fee distribution to Vault/Insurance/Treasury

## 15.2 Future Considerations

| Feature | Description |
|---------|-------------|
| Governance Token | DAO voting on parameters |
| Fee Discounts | Token staking for reduced fees |
| Revenue Share | Token holders earn protocol revenue |
| Trading Rewards | Token incentives for volume |

---

# 16. Roadmap

## Phase 1: MVP (Current)
- [x] Core trading engine
- [x] On-chain orderbook
- [x] Liquidation system
- [x] Funding rate
- [x] Vault & Insurance
- [x] Proof of Reserves
- [x] Scalability infrastructure

## Phase 2: Launch
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Initial markets (ETH, BTC)
- [ ] Community beta

## Phase 3: Growth
- [ ] Additional markets
- [ ] Mobile app
- [ ] Governance token
- [ ] Advanced order types
- [ ] Cross-margin improvements

## Phase 4: Expansion
- [ ] Multi-chain deployment
- [ ] Institutional APIs
- [ ] Copy trading
- [ ] Options (future)

---

# Appendix A: Contract Addresses

*To be populated after deployment*

| Contract | Address |
|----------|---------|
| PerpEngineV2 | `0x...` |
| OrderbookV2 | `0x...` |
| OracleRouter | `0x...` |
| Vault | `0x...` |
| InsuranceFund | `0x...` |
| ProofOfReserves | `0x...` |

---

# Appendix B: Repository Structure

```
DBS-Exchange/
├── apps/
│   ├── api/                 # Backend API + Keepers
│   │   ├── src/
│   │   │   ├── db/          # Database schemas
│   │   │   ├── keepers/     # Automated services
│   │   │   ├── lib/         # Redis, utilities
│   │   │   ├── middleware/  # Validation, caching
│   │   │   └── reserves/    # Merkle tree
│   │   └── Dockerfile
│   └── web/                 # React Frontend
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── pages/       # Route pages
│       │   ├── hooks/       # React hooks
│       │   └── lib/         # Utilities
│       └── index.html
├── packages/
│   ├── contracts/           # Solidity Smart Contracts
│   │   ├── contracts/
│   │   │   ├── v2/          # V2 Contracts (Production)
│   │   │   └── *.sol        # V1 Contracts (Legacy)
│   │   └── test/
│   └── shared/              # Shared TypeScript types
├── docs/                    # Documentation
├── docker-compose.scale.yml # Scalable deployment
└── nginx.conf               # Load balancer config
```

---

# Appendix C: Environment Variables

```env
# Blockchain
BASE_RPC_URL=https://mainnet.base.org
CHAIN_ID=8453

# Contracts
ENGINE_V2_ADDRESS=0x...
ORDERBOOK_V2_ADDRESS=0x...
ORACLE_ROUTER_ADDRESS=0x...
VAULT_ADDRESS=0x...
INSURANCE_ADDRESS=0x...
PROOF_OF_RESERVES_ADDRESS=0x...
COLLATERAL_ADDRESS=0x...  # USDC

# Database
DATABASE_URL=postgres://user:pass@host:5432/dbs_exchange

# Redis
REDIS_URL=redis://localhost:6379

# Keepers
KEEPER_PRIVATE_KEY=0x...
LIQUIDATION_KEEPER_ENABLED=true
FUNDING_KEEPER_ENABLED=true
ORDERBOOK_KEEPER_ENABLED=true
RESERVES_KEEPER_ENABLED=true

# API
API_PORT=3001
CORS_ORIGINS=https://dbs.exchange
```

---

**Document Version**: 2.0  
**Last Updated**: December 2024  
**Network**: Base L2 (Chain ID: 8453)

---

*This whitepaper is for informational purposes. Smart contracts are unaudited. Use at your own risk.*
