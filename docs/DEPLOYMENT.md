# Deployment-Guide

## Production-Deployment

Dieser Guide beschreibt, wie DBS-Exchange in einer Production-Umgebung deployed wird.

## Voraussetzungen

### Infrastructure

- **Node.js** 20+ Runtime
- **PostgreSQL** 14+ Database
- **Ethereum RPC** (Sepolia für Testnet, Mainnet für Production)
- **Reverse Proxy** (Nginx, Cloudflare, etc.)
- **SSL/TLS** Zertifikate (Let's Encrypt empfohlen)

### Umgebungsvariablen

Siehe `.env.example` für alle verfügbaren Variablen.

## Backend-Deployment

### 1. Database Setup

```bash
# PostgreSQL-Datenbank erstellen
createdb dbs_exchange

# Schema initialisieren
psql dbs_exchange < apps/api/src/db/schema.sql

# Optional: Migrationen ausführen (falls vorhanden)
# psql dbs_exchange < apps/api/src/db/migrations/001_*.sql
```

### 2. Environment Configuration

Erstelle `apps/api/.env`:

```env
# Server
API_PORT=3001
NODE_ENV=production

# RPC & Contracts
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
ENGINE_ADDRESS=0x...
ORACLE_ADDRESS=0x...
ORDERBOOK_ADDRESS=0x...
COLLATERAL_ADDRESS=0x...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbs_exchange

# Keeper Services
KEEPER_PRIVATE_KEY=0x...  # Wallet mit ETH für Gas
ORDERBOOK_KEEPER_ENABLED=true
ORDERBOOK_KEEPER_INTERVAL=10000  # 10 Sekunden
LIQUIDATION_KEEPER_ENABLED=true
LIQUIDATION_KEEPER_INTERVAL=15000  # 15 Sekunden
FUNDING_KEEPER_ENABLED=true
FUNDING_KEEPER_INTERVAL=3600000  # 1 Stunde
MAX_FUNDING_RATE=0.0001  # 0.01% pro Stunde max

# Price Feed
PRICE_FEED_URL=https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin&vs_currencies=usd
PRICE_FEED_TIMEOUT_MS=6000

# CORS
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Rate Limiting
RATE_LIMIT_PER_MINUTE=240
```

### 3. Build & Start

```bash
# Dependencies installieren
pnpm install --prod

# Build
pnpm --filter @dbs/api build

# Start mit PM2 (empfohlen)
pm2 start apps/api/dist/index.js --name dbs-api

# Oder mit systemd (siehe unten)
```

### 4. Systemd Service (Optional)

Erstelle `/etc/systemd/system/dbs-api.service`:

```ini
[Unit]
Description=DBS Exchange API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/DBS-Exchange
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/api/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dbs-api
sudo systemctl start dbs-api
```

## Frontend-Deployment

### 1. Environment Configuration

Erstelle `apps/web/.env.production`:

```env
VITE_API_URL=https://api.yourdomain.com
VITE_ENGINE_ADDRESS=0x...
VITE_ORACLE_ADDRESS=0x...
VITE_ORDERBOOK_ADDRESS=0x...
VITE_COLLATERAL_ADDRESS=0x...
VITE_FAUCET_ADDRESS=0x...
```

### 2. Build

```bash
# Build für Production
pnpm --filter @dbs/web build

# Output: apps/web/dist/
```

### 3. Static Hosting

#### Option A: Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /path/to/DBS-Exchange/apps/web/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## V2 / Base (Kurzüberblick)
- Primärnetz: **Base Mainnet (ChainId 8453)**.
- Contracts als UUPS-Proxies: OracleRouter, OrderbookV2, PerpEngineV2, Vault, InsuranceFund.
- Beispiel-ENV (Backend):
```env
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ENGINE_ADDRESS=0x...    # PerpEngineV2 Proxy
ORDERBOOK_ADDRESS=0x... # OrderbookV2 Proxy
ORACLE_ADDRESS=0x...    # OracleRouter Proxy
COLLATERAL_ADDRESS=0x...# USDC
VAULT_ADDRESS=0x...     # Vault Proxy
INSURANCE_ADDRESS=0x... # InsuranceFund Proxy
MARKET_ID=ETH-USD
```
- Beispiel-ENV (Frontend V2):
```env
VITE_API_URL=https://api.yourdomain.com
VITE_ENGINE_ADDRESS=0x...
VITE_ORDERBOOK_ADDRESS=0x...
VITE_ORACLE_ADDRESS=0x...
VITE_COLLATERAL_ADDRESS=0x...
VITE_VAULT_ADDRESS=0x...
VITE_INSURANCE_ADDRESS=0x...
VITE_MARKET_ID=ETH-USD
VITE_CHAIN_ID=8453
```
- Deploy-Flow (kurz): Deploy Router → Price Sources setzen → Deploy Engine → Markets konfigurieren → Deploy Vault/Insurance → Deploy Orderbook → Fees/Auction-Config setzen → Keeper/Indexer starten → Smoke-Tests.

#### Option B: Vercel/Netlify

1. Verbinde dein Repository mit Vercel/Netlify
2. Setze Build-Command: `pnpm --filter @dbs/web build`
3. Setze Output-Directory: `apps/web/dist`
4. Setze Environment Variables

## Contract-Verification

### Etherscan-Verification

```bash
# Contracts auf Etherscan verifizieren
pnpm --filter @dbs/contracts verify:sepolia

# Oder manuell:
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Monitoring

### Health Checks

```bash
# API Health Check
curl https://api.yourdomain.com/health

# Erwartete Response:
# {"status":"ok","timestamp":"2024-01-15T10:00:00Z"}
```

### Logging

**Backend-Logs:**
```bash
# PM2 Logs
pm2 logs dbs-api

# Systemd Logs
journalctl -u dbs-api -f
```

**Frontend-Logs:**
- Browser Console
- Error-Tracking (z.B. Sentry)

### Metrics

Empfohlene Metriken:
- API Request-Rate
- API Latency (P50, P95, P99)
- Error-Rate
- Database Query-Performance
- Keeper Execution-Rate
- WebSocket Connection-Count

## Backup-Strategie

### Database Backups

```bash
# Tägliches Backup
pg_dump dbs_exchange > backup_$(date +%Y%m%d).sql

# Automatisierung mit Cron
0 2 * * * /usr/bin/pg_dump dbs_exchange > /backups/dbs_exchange_$(date +\%Y\%m\%d).sql
```

### Contract State

- Alle Contract-Adressen dokumentieren
- Contract-ABIs versionieren
- Deployment-Scripts archivieren

## Scaling

### Horizontal Scaling

**Backend:**
- Mehrere API-Instanzen hinter Load-Balancer
- Shared PostgreSQL-Database
- Redis für WebSocket-State (Multi-Instance)

**Frontend:**
- CDN für Static Assets
- Edge-Caching

### Vertical Scaling

- Database: Query-Optimierung, Indexing
- Backend: Connection-Pooling, Caching
- Frontend: Code-Splitting, Lazy-Loading

## Security Checklist

- [ ] SSL/TLS aktiviert
- [ ] CORS richtig konfiguriert
- [ ] Rate Limiting aktiviert
- [ ] Database-Credentials sicher gespeichert
- [ ] Keeper-Private-Key sicher gespeichert
- [ ] Environment Variables nicht in Git
- [ ] Contracts auf Etherscan verifiziert
- [ ] Security-Audit durchgeführt (für Production)
- [ ] Monitoring & Alerting eingerichtet
- [ ] Backup-Strategie implementiert

## Troubleshooting

### Backend startet nicht

1. Prüfe Database-Verbindung: `psql $DATABASE_URL`
2. Prüfe RPC-Verbindung: `curl $SEPOLIA_RPC_URL`
3. Prüfe Logs: `pm2 logs dbs-api` oder `journalctl -u dbs-api`

### Frontend zeigt keine Daten

1. Prüfe API-URL in `.env.production`
2. Prüfe CORS-Konfiguration
3. Prüfe Browser-Console für Fehler
4. Prüfe Network-Tab für fehlgeschlagene Requests

### Keeper führen keine Aktionen aus

1. Prüfe `KEEPER_PRIVATE_KEY` ist gesetzt
2. Prüfe Wallet hat genug ETH für Gas
3. Prüfe Keeper-Logs für Fehler
4. Prüfe Keeper-Intervals sind nicht zu lang

## Support

Bei Problemen:
1. Prüfe Logs
2. Prüfe GitHub Issues
3. Erstelle ein neues Issue mit Details
