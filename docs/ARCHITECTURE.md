# System-Architektur

## Übersicht

DBS-Exchange ist eine dezentrale Perpetuals-Börse mit einer modularen Architektur, die aus Smart Contracts, Backend-Services und einem Frontend besteht.

## Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ TradingView  │  │  Web3 (Wagmi) │  │  WebSocket   │      │
│  │   Charts     │  │   Integration │  │   Client     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/WS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Fastify)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  REST API    │  │  WebSocket   │  │   Indexer    │      │
│  │  Endpoints   │  │   Stream     │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Oracle       │  │ Orderbook    │  │ Liquidation  │      │
│  │ Keeper       │  │ Keeper       │  │ Keeper       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐                                          │
│  │ Funding      │                                          │
│  │ Keeper       │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ RPC Calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Ethereum Blockchain (Sepolia)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PerpEngine   │  │  Orderbook   │  │   Oracle    │      │
│  │  Contract    │  │  Contract    │  │  Contract   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Collateral   │  │   Faucet     │  │  Timelock    │      │
│  │   Token      │  │  Contract    │  │  Contract    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Trades     │  │  Positions   │  │   Funding    │      │
│  │   History    │  │   History    │  │   History   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Orders     │  │  Indexer     │                        │
│  │   History    │  │   State      │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Komponenten-Details

### Smart Contracts

#### PerpEngine.sol

**Zweck**: Kern-Engine für Perpetuals-Trading

**Hauptfunktionen**:
- `openPosition()`: Öffnet eine neue Position
- `closePosition()`: Schließt eine Position
- `updatePosition()`: Aktualisiert eine bestehende Position
- `liquidate()`: Liquidiert eine unterbesicherte Position
- `setFundingRate()`: Setzt den Funding-Rate für einen Market

**Sicherheitsfeatures**:
- Reentrancy-Guards
- Access-Control (Owner/Operator)
- Margin-Validierung
- Staleness-Checks für Oracle-Preise

#### Orderbook.sol

**Zweck**: On-Chain Limit/Stop-Order-System

**Hauptfunktionen**:
- `createOrder()`: Erstellt eine Limit/Stop-Order
- `cancelOrder()`: Storniert eine Order
- `executeOrder()`: Führt eine Order aus (durch Keeper)

**Order-Typen**:
- **Limit Orders**: Ausführung bei Erreichen eines bestimmten Preises
- **Stop Orders**: Ausführung bei Erreichen eines Stop-Preises
- **Reduce-Only**: Nur zum Schließen/Reduzieren bestehender Positionen

#### Oracle.sol

**Zweck**: Preis-Feed-Management

**Hauptfunktionen**:
- `setPrice()`: Setzt den Preis für einen Market (Owner-only)
- `getPriceData()`: Gibt Preis und Timestamp zurück

**Sicherheitsfeatures**:
- Max-Deviation-Guard
- Staleness-Checks
- Owner-only Updates

### Backend Services

#### REST API

**Endpoints**:
- `GET /markets`: Liste aller Markets
- `GET /orderbook?market=ETH-USD`: Orderbook für einen Market
- `GET /trades/:marketId`: Trade-History für einen Market
- `GET /positions/:address`: Positionen eines Users
- `GET /orders?address=0x...`: Orders eines Users
- `GET /history/:address`: Trade/Position-History eines Users
- `GET /funding/:marketId`: Funding-Rate-History

#### WebSocket Stream

**Message-Typen**:
- `markets`: Market-Updates
- `orderbook`: Orderbook-Updates
- `trades`: Trade-Updates
- `positions`: Position-Updates (user-specific)
- `orders`: Order-Updates (user-specific)

#### Event Indexer

**Indexierte Events**:
- `PositionOpened`: Neue Positionen
- `PositionClosed`: Geschlossene Positionen
- `PositionUpdated`: Aktualisierte Positionen
- `Liquidated`: Liquidierte Positionen
- `OrderCreated`: Neue Orders
- `OrderExecuted`: Ausgeführte Orders
- `OrderCancelled`: Stornierte Orders
- `FundingRateUpdated`: Funding-Rate-Updates
- `PriceUpdated`: Preis-Updates

**Features**:
- Batch-Processing für historische Events
- Restart-Safety (speichert letzten verarbeiteten Block)
- Reorg-Handling

#### Keeper Services

**Oracle Keeper**:
- Aktualisiert Oracle-Preise regelmäßig (z.B. alle 30 Sekunden)
- Liest Preise von externen APIs (z.B. CoinGecko)

**Orderbook Keeper**:
- Prüft alle aktiven Orders regelmäßig (z.B. alle 10 Sekunden)
- Führt Orders aus, wenn Trigger-Bedingungen erfüllt sind

**Liquidation Keeper**:
- Scannt alle Positionen regelmäßig (z.B. alle 15 Sekunden)
- Liquidiert Positionen, die unter Maintenance-Margin fallen

**Funding Keeper**:
- Berechnet Funding-Rates basierend auf Long/Short-Imbalance
- Aktualisiert Funding-Rates im Contract (z.B. stündlich)

### Frontend

#### Komponenten

- **TradingViewChart**: TradingView-Integration für Charts
- **OrderBook**: Orderbook-Visualisierung mit Depth-Chart
- **OrderEntry**: Order-Eingabe (Market/Limit/Stop)
- **Positions**: Position-Übersicht mit Liquidations-Warnungen
- **OpenOrders**: Aktive Orders
- **TradeHistory**: Trade-History
- **PortfolioAnalytics**: Portfolio-Performance-Analytics
- **AccountPanel**: Account-Übersicht (Balance, Margin, etc.)

#### State Management

- **useMarketData**: Hook für Market-Daten (WebSocket-basiert)
- **useLiquidationPrice**: Hook für Liquidationspreis-Berechnung
- **useSettings**: Hook für User-Settings (localStorage)
- **useToast**: Hook für Toast-Notifications

## Data Flow

### Order-Execution Flow

```
User → Frontend → OrderEntry Component
  ↓
Web3 Transaction → Orderbook.createOrder()
  ↓
Orderbook Contract emits OrderCreated Event
  ↓
Indexer → PostgreSQL (orders_history)
  ↓
Orderbook Keeper checks trigger conditions
  ↓
Orderbook Keeper → Orderbook.executeOrder()
  ↓
Orderbook Contract → PerpEngine.openPositionFor()
  ↓
PerpEngine Contract emits PositionOpened Event
  ↓
Indexer → PostgreSQL (positions_history)
  ↓
WebSocket → Frontend (Real-Time Update)
```

### Liquidation Flow

```
Liquidation Keeper scans positions
  ↓
Checks _isLiquidatable() for each position
  ↓
Liquidation Keeper → PerpEngine.liquidate()
  ↓
PerpEngine Contract emits Liquidated Event
  ↓
Indexer → PostgreSQL (positions_history)
  ↓
WebSocket → Frontend (Real-Time Update)
```

## Security Model

### Smart Contract Security

- **Reentrancy-Guards**: Alle externen Calls sind geschützt
- **Access-Control**: Owner/Operator-Pattern für kritische Funktionen
- **Input-Validation**: Umfassende Validierung aller Inputs
- **Timelock**: Delayed-Execution für Admin-Funktionen

### Backend Security

- **Rate Limiting**: API-Rate-Limits für DDoS-Schutz
- **Input Validation**: Validierung aller API-Inputs
- **SQL Injection Prevention**: Parameterized Queries
- **CORS Configuration**: Restriktive CORS-Policy

### Frontend Security

- **Wallet-Integration**: Sichere Wallet-Verbindung via Wagmi
- **Transaction-Simulation**: Pre-Flight-Checks vor Transaktionen
- **Input-Sanitization**: XSS-Schutz

## Skalierung

### Horizontal Scaling

- **Backend**: Mehrere API-Instanzen hinter Load-Balancer
- **Database**: PostgreSQL-Replikation für Read-Scaling
- **WebSocket**: Redis-Pub/Sub für Multi-Instance-WebSocket

### Vertical Scaling

- **Database**: Query-Optimierung, Indexing
- **Backend**: Caching-Strategien, Connection-Pooling
- **Frontend**: Code-Splitting, Lazy-Loading

## Monitoring

### Health Checks

- **API Health**: `GET /health`
- **Database Health**: Connection-Check
- **Keeper Health**: Last-Execution-Timestamp

### Metrics

- **API Metrics**: Request-Rate, Latency, Error-Rate
- **Keeper Metrics**: Execution-Count, Success-Rate
- **Database Metrics**: Query-Performance, Connection-Pool-Usage

## Deployment

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für detaillierte Deployment-Anleitungen.

