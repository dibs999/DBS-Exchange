# V2 Roadmap (Orderbook + PerpEngine + Vault)

Context: V1 bleibt als Legacy-Pfad (Frontend-Untermenü). V2 nutzt USDC (6 decimals, intern 1e18-Skalierung), UUPS-Upgradeable, primäres Netz: Base.

## Scope & Ziele
- Hybrid Matching: Continuous + Batch Auction, Price-Time-Priority, Tick-basiert.
- Cross-Margin Engine mit Funding, Liquidation (partial), OI-/Exposure-Caps, Maker/Taker-Gebühren.
- Vault + Insurance Fund als Residual Counterparty (Auction) + Fee-Split.
- OracleRouter mit Multi-Source-Aggregation, TWAP und Staleness/Deviation Guards.
- Upgradeability: UUPS + Timelock/Governance später; vorerst Owner-gated.

## Verträge (V2)
- `PerpEngineV2` (UUPS): Cross-Margin, Funding, Liquidation, OI-Caps, Fee-Split (Vault/Insurance/Treasury), ADL-Flag, USDC 6d -> 1e18 intern.
- `OrderbookV2` (UUPS): Tick-Levels (FIFO), Continuous Matching, Batch Auction (clearing price), Stop-Trigger via Keeper, optional Vault Residual-Fills.
- `OracleRouter` (UUPS): Multi-Source, MaxAge, MaxDeviation, TWAP-Window, `updatePrice` Aggregation.
- `Vault` (UUPS, ERC20 shares): USDC LP, optional Engine allocation, share accounting.
- `InsuranceFund` (UUPS): USDC Treasury + optional Engine allocation.
- Mocks: `USDCMock` (6d) für Tests.

## Offene Implementierungsitems
- PerpEngineV2: ADL-Flow, Governance (Timelock/UUPS admin), funding source calc, deficits settlement edge cases, operator approvals, events completeness.
- OrderbookV2: Level bookkeeping correctness, vault residual path safety, dust handling, maker/taker fee caps, trigger keeper logic for stops.
- OracleRouter: Source adapters, owner ops auth, TWAP boundary cases.
- Vault/Insurance: Allocation/withdraw guardrails, share rounding, pause hooks.
- Hardhat tasks/scripts für Base Deploy, Proxy admin wiring.

## Backend (API/Indexer/Keepers)
- DB-Schema erweitern: V2 Events (OrderMatched/AuctionExecuted, Funding, Liquidations, Fees, Vault flows).
- Indexer: neue ABIs, Base RPC, restart-safety, partial fill handling.
- Keepers: Auction executor, Stop trigger keeper, Funding updater (on-chain), Liquidation keeper (V2), Oracle router updater (multi-source).
- API/WS: Dual-Stack V1/V2 Endpoints (z.B. `/v1/*`, `/v2/*`), Live data aus V2 Events, remove mocks.

## Frontend
- Netzwerk: Base (Chain ID 8453) plus Legacy Sepolia für V1 im Untermenü.
- V2 Order Entry: Market/Limit/Stop, Continuous/Auction toggle, Maker/Taker fees, slippage, operator approvals (falls nötig).
- Orderbook/Trades: Live von WS (V2), Auction state anzeigen, Spread aus ticks.
- Positions/Health: Maintenance/Initial Margin aus Contract, Funding/PnL real, Liquidation Price aus V2 Config.
- Vault UI: echte Ein-/Auszahlungen (USDC 6d), Anteil, Pending rewards (falls Fees), Claim path.
- Toggle zwischen V1/V2 Views (Legacy Menü).

## Deployment/Config
- Hardhat: Base Netzwerk, Proxy Deploy (UUPS), .env Beispiele aktualisieren (API + Web).
- Scripts: Seed market, set oracle sources, set fees/limits, wire vault/insurance/treasury, keeper keys.
- Docs: DEPLOYMENT für Base, ENV Variablen (V1/V2 getrennt).

## Tests
- Unit: Engine (funding, liquidation, fees), Orderbook (FIFO, matching, auctions, vault residual), OracleRouter (sources, TWAP), Vault/Insurance (shares).
- Invariants/Fuzz: margin safety, OI caps, fee conservation, no stuck orders.
- Integration: Keeper loops (auction/stop/funding/liquidation), Indexer parity, Frontend smoke.

## Legacy (V1)
- V1 bleibt deploybar (Sepolia), Frontend als Untermenü/Labelling "Legacy".
- Backend darf V1 Endpoints weiter bedienen, aber V2 ist Default.
