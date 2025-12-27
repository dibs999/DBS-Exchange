# API-Dokumentation

## REST API

Base URL: `http://localhost:3001` (Development)

### Markets

#### GET /markets

Gibt eine Liste aller verfügbaren Markets zurück.

**Response:**
```json
[
  {
    "id": "ETH-USD",
    "base": "ETH",
    "quote": "USD",
    "symbol": "ETH/USD",
    "tvSymbol": "BINANCE:ETHUSDT",
    "markPrice": 3200.5,
    "indexPrice": 3194.2,
    "change24h": 1.2,
    "volume24h": 482000000,
    "fundingRate": 0.004,
    "openInterest": 92000000
  }
]
```

### Orderbook

#### GET /orderbook?market=ETH-USD

Gibt das Orderbook für einen Market zurück.

**Query Parameters:**
- `market` (required): Market ID (z.B. "ETH-USD")

**Response:**
```json
{
  "bids": [
    { "price": 3200.0, "size": 1.5, "total": 1.5 },
    { "price": 3199.5, "size": 2.0, "total": 3.5 }
  ],
  "asks": [
    { "price": 3201.0, "size": 1.2, "total": 1.2 },
    { "price": 3201.5, "size": 1.8, "total": 3.0 }
  ]
}
```

### Trades

#### GET /trades/:marketId

Gibt die Trade-History für einen Market zurück.

**Path Parameters:**
- `marketId`: Market ID (z.B. "ETH-USD")

**Response:**
```json
[
  {
    "id": "t1",
    "time": "09:20:14",
    "price": 3201.2,
    "size": 0.18,
    "side": "buy"
  }
]
```

### Positions

#### GET /positions/:address

Gibt alle offenen Positionen eines Users zurück.

**Path Parameters:**
- `address`: Ethereum-Adresse (0x...)

**Response:**
```json
[
  {
    "id": "pos1",
    "marketId": "ETH-USD",
    "side": "long",
    "size": 1.5,
    "entryPrice": 3180.0,
    "markPrice": 3200.5,
    "margin": 100.0,
    "leverage": 10,
    "pnl": 30.75,
    "liquidationPrice": 2900.0
  }
]
```

### Orders

#### GET /orders?address=0x...

Gibt alle aktiven Orders eines Users zurück.

**Query Parameters:**
- `address` (required): Ethereum-Adresse (0x...)

**Response:**
```json
[
  {
    "id": "order1",
    "marketId": "ETH-USD",
    "side": "buy",
    "type": "limit",
    "size": 1.0,
    "triggerPrice": 3150.0,
    "leverage": 10,
    "status": "open"
  }
]
```

### History

#### GET /history/:address

Gibt die Trade- und Position-History eines Users zurück.

**Path Parameters:**
- `address`: Ethereum-Adresse (0x...)

**Response:**
```json
{
  "trades": [
    {
      "id": "tx1",
      "marketId": "ETH-USD",
      "side": "buy",
      "size": 0.5,
      "price": 3180.0,
      "pnl": null,
      "fee": 1.6,
      "closedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "positions": [
    {
      "id": "pos1",
      "marketId": "ETH-USD",
      "side": "long",
      "size": 1.5,
      "entryPrice": 3180.0,
      "exitPrice": 3220.0,
      "pnl": 60.0,
      "margin": 100.0,
      "leverage": 10,
      "closedAt": "2024-01-15T11:00:00Z"
    }
  ]
}
```

### Funding

#### GET /funding/:marketId

Gibt die Funding-Rate-History für einen Market zurück.

**Path Parameters:**
- `marketId`: Market ID (z.B. "ETH-USD")

**Response:**
```json
[
  {
    "marketId": "ETH-USD",
    "rate": 0.0001,
    "cumulativeRate": 0.004,
    "blockNumber": 12345678,
    "timestamp": "2024-01-15T10:00:00Z"
  }
]
```

### Health

#### GET /health

Health-Check-Endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## WebSocket API

WebSocket URL: `ws://localhost:3001/ws`

### Message-Format

Alle Nachrichten sind JSON-Objekte mit folgendem Format:

```typescript
type WsMessage = 
  | { type: 'markets'; data: Market[] }
  | { type: 'orderbook'; marketId: string; data: Orderbook }
  | { type: 'trades'; marketId: string; data: Trade[] }
  | { type: 'positions'; address: string; data: Position[] }
  | { type: 'orders'; address: string; data: Order[] }
  | { type: 'prices'; data: PriceFeed };
```

### Client-Verbindung

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'markets':
      // Handle market updates
      break;
    case 'orderbook':
      // Handle orderbook updates
      break;
    case 'trades':
      // Handle trade updates
      break;
    case 'positions':
      // Handle position updates (user-specific)
      break;
    case 'orders':
      // Handle order updates (user-specific)
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket closed');
};
```

### Message-Typen

#### markets

Aktualisiert die Liste aller Markets.

```json
{
  "type": "markets",
  "data": [
    {
      "id": "ETH-USD",
      "base": "ETH",
      "quote": "USD",
      "symbol": "ETH/USD",
      "tvSymbol": "BINANCE:ETHUSDT",
      "markPrice": 3200.5,
      "indexPrice": 3194.2,
      "change24h": 1.2,
      "volume24h": 482000000,
      "fundingRate": 0.004,
      "openInterest": 92000000
    }
  ]
}
```

#### orderbook

Aktualisiert das Orderbook für einen Market.

```json
{
  "type": "orderbook",
  "marketId": "ETH-USD",
  "data": {
    "bids": [
      { "price": 3200.0, "size": 1.5, "total": 1.5 }
    ],
    "asks": [
      { "price": 3201.0, "size": 1.2, "total": 1.2 }
    ]
  }
}
```

#### trades

Aktualisiert die Trade-Liste für einen Market.

```json
{
  "type": "trades",
  "marketId": "ETH-USD",
  "data": [
    {
      "id": "t1",
      "time": "09:20:14",
      "price": 3201.2,
      "size": 0.18,
      "side": "buy"
    }
  ]
}
```

#### positions

Aktualisiert die Positionen eines Users (nur für die eigene Adresse).

```json
{
  "type": "positions",
  "address": "0x1234...",
  "data": [
    {
      "id": "pos1",
      "marketId": "ETH-USD",
      "side": "long",
      "size": 1.5,
      "entryPrice": 3180.0,
      "markPrice": 3200.5,
      "margin": 100.0,
      "leverage": 10,
      "pnl": 30.75,
      "liquidationPrice": 2900.0
    }
  ]
}
```

#### orders

Aktualisiert die Orders eines Users (nur für die eigene Adresse).

```json
{
  "type": "orders",
  "address": "0x1234...",
  "data": [
    {
      "id": "order1",
      "marketId": "ETH-USD",
      "side": "buy",
      "type": "limit",
      "size": 1.0,
      "triggerPrice": 3150.0,
      "leverage": 10,
      "status": "open"
    }
  ]
}
```

## Rate Limiting

Die API hat standardmäßig ein Rate-Limit von **240 Requests pro Minute** pro IP-Adresse.

Dies kann über die Umgebungsvariable `RATE_LIMIT_PER_MINUTE` konfiguriert werden.

## Fehlerbehandlung

### HTTP-Status-Codes

- `200 OK`: Erfolgreiche Anfrage
- `400 Bad Request`: Ungültige Anfrage
- `404 Not Found`: Ressource nicht gefunden
- `429 Too Many Requests`: Rate-Limit überschritten
- `500 Internal Server Error`: Server-Fehler

### Fehler-Response-Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Authentifizierung

Aktuell ist keine Authentifizierung erforderlich. User-spezifische Daten (Positions, Orders) werden über die Ethereum-Adresse identifiziert.

Für Production-Deployments sollte eine Authentifizierung implementiert werden (z.B. JWT-Tokens oder API-Keys).

