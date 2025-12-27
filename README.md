# DBS-Exchange

Ein vollständiges, production-ready Open-Source-Gerüst für eine dezentrale Perpetuals-Börse (DEX). Dieses Framework dient als Basis für eigene Implementierungen oder als Lernressource für dezentrale Trading-Plattformen.

## 🎯 Vision

DBS-Exchange ist ein vollständiges Framework für eine dezentrale Perpetuals-Börse mit:
- **On-Chain Trading Engine**: Smart Contracts für Margin-Trading, Liquidations und Funding
- **On-Chain Orderbook**: Limit- und Stop-Orders direkt auf der Blockchain
- **Real-Time Backend**: Fastify API mit WebSocket-Streaming und Event-Indexing
- **Modern Frontend**: React-basiertes Trading-Interface mit TradingView-Integration
- **Keeper Services**: Automatisierte Liquidations, Order-Execution und Funding-Rate-Updates
- **Production-Ready**: PostgreSQL-Integration, umfassende Dokumentation, CI/CD-Pipeline

## 📁 Projektstruktur

```
DBS-Exchange/
├── apps/
│   ├── web/          # React + Vite Frontend (TradingView, Perps UI, Web3)
│   └── api/           # Fastify API + WebSocket Streams + Event-Indexer + Keepers
├── packages/
│   ├── contracts/     # Hardhat + Solidity (CollateralToken, Oracle, PerpEngine, Orderbook, Faucet, Timelock)
│   └── shared/        # Gemeinsame TypeScript-Types (Market, Orderbook, Trades, Positions)
└── docs/              # Vollständige Dokumentation
```

## 🚀 Schnellstart

### Voraussetzungen

- **Node.js** 20+ und **pnpm** 9+
- **PostgreSQL** 14+ (für Production-Indexer)
- **Sepolia RPC** + Wallet Key (für Deploy/Oracle-Keeper)

### Installation

```bash
# Repository klonen
git clone <repository-url>
cd DBS-Exchange

# Dependencies installieren
pnpm install
```

### Umgebungsvariablen

Erstelle `.env`-Dateien basierend auf den Beispielen:

```bash
# Root
cp .env.example .env

# Backend
cp apps/api/.env.example apps/api/.env

# Frontend
cp apps/web/.env.example apps/web/.env
```

**Wichtige Variablen:**

**Backend (`apps/api/.env`):**
```env
# RPC & Contracts
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
ENGINE_ADDRESS=0x...
ORACLE_ADDRESS=0x...
ORDERBOOK_ADDRESS=0x...
COLLATERAL_ADDRESS=0x...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbs_exchange

# Keeper (optional)
KEEPER_PRIVATE_KEY=0x...  # Für automatische Liquidations, Order-Execution, Funding-Updates
ORDERBOOK_KEEPER_ENABLED=true
LIQUIDATION_KEEPER_ENABLED=true
FUNDING_KEEPER_ENABLED=true
```

**Frontend (`apps/web/.env`):**
```env
VITE_API_URL=http://localhost:3001
VITE_ENGINE_ADDRESS=0x...
VITE_ORACLE_ADDRESS=0x...
VITE_ORDERBOOK_ADDRESS=0x...
VITE_COLLATERAL_ADDRESS=0x...
```

### Lokale Entwicklung

```bash
# Alle Services starten (Frontend + Backend)
pnpm dev

# Oder einzeln:
pnpm --filter @dbs/web dev      # Frontend: http://localhost:5173
pnpm --filter @dbs/api dev      # Backend: http://localhost:3001
```

**WebSocket:** `ws://localhost:3001/ws`

## 📦 Contracts deployen (Sepolia)

```bash
# Contracts kompilieren
pnpm --filter @dbs/contracts compile

# Auf Sepolia deployen
pnpm --filter @dbs/contracts deploy:sepolia
```

Die Deploy-Adressen werden nach `packages/contracts/deployments/sepolia.json` geschrieben. Diese Adressen müssen dann in die `.env`-Dateien eingetragen werden.

**Deployment-Reihenfolge:**
1. `CollateralToken` (oUSD)
2. `Oracle`
3. `PerpEngine` (mit Oracle-Address)
4. `Orderbook` (mit Engine-Address)
5. `Faucet` (mit CollateralToken-Address)
6. `Timelock` (optional, für Admin-Funktionen)

## 🏗️ Architektur

### Smart Contracts

- **`PerpEngine.sol`**: Margin-Engine für Perpetuals-Trading
  - Position-Management (Open/Close/Update)
  - Margin-Berechnung und Liquidations
  - Funding-Rate-Verwaltung
  - P&L-Berechnung

- **`Orderbook.sol`**: On-Chain Limit/Stop-Order-System
  - Limit-Orders (Buy/Sell bei bestimmten Preisen)
  - Stop-Orders (Trigger bei Preis-Erreichen)
  - Reduce-Only-Orders
  - Operator-Approval-Mechanismus

- **`Oracle.sol`**: Preis-Feed-Management
  - Owner-updated Price-Feeds
  - Max-Deviation-Guard
  - Staleness-Checks

- **`CollateralToken.sol`**: ERC20-Token (oUSD) als Collateral

- **`Faucet.sol`**: Testnet-Token-Verteilung mit Rate-Limits

- **`Timelock.sol`**: Delayed-Execution für kritische Admin-Funktionen

### Backend Services

- **REST API** (`apps/api/src/index.ts`): REST-Endpoints für Markets, Orderbook, Trades, Positions
- **WebSocket Stream** (`apps/api/src/index.ts`): Real-Time-Updates für Orderbook, Trades, Positions
- **Event Indexer** (`apps/api/src/indexer.ts`): Indexiert on-chain Events in PostgreSQL
- **Oracle Keeper** (`apps/api/src/index.ts`): Automatische Oracle-Preis-Updates
- **Orderbook Keeper** (`apps/api/src/keepers/orderbookKeeper.ts`): Führt Limit/Stop-Orders aus
- **Liquidation Keeper** (`apps/api/src/keepers/liquidationKeeper.ts`): Automatische Liquidations
- **Funding Keeper** (`apps/api/src/keepers/fundingKeeper.ts`): Automatische Funding-Rate-Updates

### Frontend

- **React + Vite**: Moderne Frontend-Architektur
- **Wagmi/Viem**: Web3-Integration
- **TradingView**: Chart-Integration
- **Real-Time Updates**: WebSocket-basierte Live-Daten
- **Responsive Design**: Mobile-optimiert

## 📚 Dokumentation

Vollständige Dokumentation findest du im `docs/`-Verzeichnis:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Detaillierte System-Architektur
- **[API.md](docs/API.md)**: REST API und WebSocket-Protokoll
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)**: Production-Deployment-Guide
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)**: Beitragsrichtlinien
- **[SECURITY.md](docs/SECURITY.md)**: Security-Best-Practices

## 🔧 Entwicklung

### Code-Style

```bash
# Linting
pnpm lint

# Formatting
pnpm format

# Type-Checking
pnpm typecheck
```

### Testing

```bash
# Contract Tests
pnpm --filter @dbs/contracts test

# Backend Tests
pnpm --filter @dbs/api test

# Frontend Tests
pnpm --filter @dbs/web test
```

### Database Setup

```bash
# PostgreSQL-Datenbank erstellen
createdb dbs_exchange

# Schema initialisieren
psql dbs_exchange < apps/api/src/db/schema.sql
```

## 🛡️ Security

- **Smart Contract Security**: Reentrancy-Guards, Access-Control, Input-Validation
- **Timelock**: Delayed-Execution für kritische Admin-Funktionen
- **Rate Limiting**: API-Rate-Limits für DDoS-Schutz
- **Input Validation**: Umfassende Validierung aller User-Inputs

Siehe [SECURITY.md](docs/SECURITY.md) für Details.

## 🤝 Beitragen

Wir freuen uns über Beiträge! Bitte lies [CONTRIBUTING.md](docs/CONTRIBUTING.md) für Details.

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

## 🙏 Danksagungen

- OpenZeppelin für Security-Best-Practices
- TradingView für Chart-Integration
- Viem/Wagmi für Web3-Tooling

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**⚠️ Wichtig**: Dieses Framework ist für **Testnet/Development** gedacht. Für Production-Deployments sind zusätzliche Security-Audits und Optimierungen erforderlich.
