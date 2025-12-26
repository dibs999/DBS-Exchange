# DBS-Exchange Monorepo

Obsidian Drift ist ein Sepolia-MVP fuer eine DEX/Perps-Webapp mit eigener On-Chain-Engine, Backend-Streaming und einem eigenstaendigen UI-Branding.

## Struktur

- `apps/web` - React + Vite Frontend (TradingView, Perps UI, Web3)
- `apps/api` - Fastify API + WebSocket Streams + Event-Indexer
- `packages/contracts` - Hardhat + Solidity (CollateralToken, Oracle, PerpEngine, Orderbook)
- `packages/shared` - Gemeinsame Types (Market, Orderbook, Trades, Positions)

## Voraussetzungen

- Node.js 20+
- pnpm 9+
- Sepolia RPC + Wallet Key (nur fuer Deploy/Oracle-Keeper)

## Setup

```bash
pnpm install
```

Erstelle Umgebungsvariablen:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Lokale Entwicklung

```bash
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001
- WS: ws://localhost:3001/ws

## Contracts deployen (Sepolia)

```bash
pnpm --filter @dbs/contracts deploy:sepolia
```

Die Deploy-Adresse wird nach `packages/contracts/deployments/sepolia.json` geschrieben. Danach die Addresses in `apps/api/.env` und `apps/web/.env` eintragen (inkl. Orderbook).

## Hinweise (MVP)

- Engine nutzt 18-decimals und erwartet `oUSD` als Collateral.
- Position-Reversal in einem Schritt ist eingeschraenkt (erst schliessen, dann drehen).
- Oracle ist Owner-updated, mit Max-Deviation-Guard und Staleness-Checks im Engine-Contract.
- Orderbook ist on-chain und nutzt Operator-Approval fuer limit/stop Orders.
- API streamt Orderbook/Trades via WS und legt Positionen ueber Events ab.
