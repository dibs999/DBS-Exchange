-- V2 Database Schema for DBS Exchange

-- V2 Orders (with auction state, partial fills)
CREATE TABLE IF NOT EXISTS v2_orders (
    order_id BIGINT PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    market_id VARCHAR(50) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    type VARCHAR(10) NOT NULL CHECK (type IN ('market', 'limit', 'stop')),
    mode VARCHAR(10) NOT NULL CHECK (mode IN ('continuous', 'batch')),
    size NUMERIC(36, 18) NOT NULL,
    filled NUMERIC(36, 18) DEFAULT 0,
    price NUMERIC(36, 18),
    trigger_price NUMERIC(36, 18),
    status VARCHAR(20) NOT NULL CHECK (status IN ('live', 'queued_for_auction', 'trigger_pending', 'filled', 'cancelled')),
    auction_state VARCHAR(20) CHECK (auction_state IN ('queued', 'executed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    filled_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    tx_hash VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_v2_orders_address ON v2_orders (address);
CREATE INDEX IF NOT EXISTS idx_v2_orders_market ON v2_orders (market_id);
CREATE INDEX IF NOT EXISTS idx_v2_orders_status ON v2_orders (status);
CREATE INDEX IF NOT EXISTS idx_v2_orders_created ON v2_orders (created_at);

-- V2 Trades (with maker/taker flags, fees)
CREATE TABLE IF NOT EXISTS v2_trades (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(50) NOT NULL,
    order_id BIGINT,
    maker_address VARCHAR(42),
    taker_address VARCHAR(42),
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    size NUMERIC(36, 18) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    maker_fee NUMERIC(36, 18),
    taker_fee NUMERIC(36, 18),
    is_maker BOOLEAN,
    auction_id BIGINT,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_trades_market ON v2_trades (market_id);
CREATE INDEX IF NOT EXISTS idx_v2_trades_maker ON v2_trades (maker_address);
CREATE INDEX IF NOT EXISTS idx_v2_trades_taker ON v2_trades (taker_address);
CREATE INDEX IF NOT EXISTS idx_v2_trades_order ON v2_trades (order_id);
CREATE INDEX IF NOT EXISTS idx_v2_trades_auction ON v2_trades (auction_id);
CREATE INDEX IF NOT EXISTS idx_v2_trades_created ON v2_trades (created_at);

-- V2 Positions (with funding entry)
CREATE TABLE IF NOT EXISTS v2_positions (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    market_id VARCHAR(50) NOT NULL,
    size NUMERIC(36, 18) NOT NULL,
    entry_price NUMERIC(36, 18) NOT NULL,
    funding_entry NUMERIC(36, 18) NOT NULL,
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP,
    tx_hash_open VARCHAR(66),
    tx_hash_close VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_v2_positions_address ON v2_positions (address);
CREATE INDEX IF NOT EXISTS idx_v2_positions_market ON v2_positions (market_id);
CREATE INDEX IF NOT EXISTS idx_v2_positions_opened ON v2_positions (opened_at);
CREATE INDEX IF NOT EXISTS idx_v2_positions_open ON v2_positions (address, market_id) WHERE closed_at IS NULL;

-- Vault Deposits
CREATE TABLE IF NOT EXISTS vault_deposits (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    assets NUMERIC(36, 6) NOT NULL, -- USDC 6 decimals
    shares NUMERIC(36, 18) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_deposits_address ON vault_deposits (address);
CREATE INDEX IF NOT EXISTS idx_vault_deposits_created ON vault_deposits (created_at);

-- Vault Withdrawals
CREATE TABLE IF NOT EXISTS vault_withdrawals (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    assets NUMERIC(36, 6) NOT NULL, -- USDC 6 decimals
    shares NUMERIC(36, 18) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_withdrawals_address ON vault_withdrawals (address);
CREATE INDEX IF NOT EXISTS idx_vault_withdrawals_created ON vault_withdrawals (created_at);

-- Insurance Fund State
CREATE TABLE IF NOT EXISTS insurance_fund_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    balance NUMERIC(36, 18) NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Auction History
CREATE TABLE IF NOT EXISTS auction_history (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(50) NOT NULL,
    clearing_price NUMERIC(36, 18) NOT NULL,
    orders_touched INTEGER NOT NULL,
    buy_volume NUMERIC(36, 18) NOT NULL,
    sell_volume NUMERIC(36, 18) NOT NULL,
    matched_volume NUMERIC(36, 18) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_history_market ON auction_history (market_id);
CREATE INDEX IF NOT EXISTS idx_auction_history_created ON auction_history (created_at);

-- V2 Funding History (enhanced)
CREATE TABLE IF NOT EXISTS v2_funding_history (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(50) NOT NULL,
    rate_per_second NUMERIC(36, 18) NOT NULL,
    cumulative_rate NUMERIC(36, 18) NOT NULL,
    long_notional NUMERIC(36, 18) NOT NULL,
    short_notional NUMERIC(36, 18) NOT NULL,
    imbalance NUMERIC(36, 18) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_funding_market ON v2_funding_history (market_id);
CREATE INDEX IF NOT EXISTS idx_v2_funding_created ON v2_funding_history (created_at);

-- V2 Indexer State (for restart safety)
CREATE TABLE IF NOT EXISTS v2_indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

