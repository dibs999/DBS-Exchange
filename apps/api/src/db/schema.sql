-- Obsidian Drift Database Schema

-- Trades (historical)
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(50) NOT NULL,
    address VARCHAR(42) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    size NUMERIC(36, 18) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    pnl NUMERIC(36, 18),
    fee NUMERIC(36, 18),
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (market_id);
CREATE INDEX IF NOT EXISTS idx_trades_address ON trades (address);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades (created_at);

-- Positions (historical)
CREATE TABLE IF NOT EXISTS positions_history (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) NOT NULL,
    market_id VARCHAR(50) NOT NULL,
    side VARCHAR(5) NOT NULL CHECK (side IN ('long', 'short')),
    size NUMERIC(36, 18) NOT NULL,
    entry_price NUMERIC(36, 18) NOT NULL,
    exit_price NUMERIC(36, 18),
    margin NUMERIC(36, 18) NOT NULL,
    pnl NUMERIC(36, 18),
    leverage INTEGER NOT NULL,
    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,
    tx_hash_open VARCHAR(66),
    tx_hash_close VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_positions_address ON positions_history (address);
CREATE INDEX IF NOT EXISTS idx_positions_market ON positions_history (market_id);
CREATE INDEX IF NOT EXISTS idx_positions_opened ON positions_history (opened_at);

-- Funding rate history
CREATE TABLE IF NOT EXISTS funding_history (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(50) NOT NULL,
    rate NUMERIC(36, 18) NOT NULL,
    cumulative_rate NUMERIC(36, 18) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funding_market ON funding_history (market_id);
CREATE INDEX IF NOT EXISTS idx_funding_created ON funding_history (created_at);

-- Orders (historical)
CREATE TABLE IF NOT EXISTS orders_history (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL UNIQUE,
    address VARCHAR(42) NOT NULL,
    market_id VARCHAR(50) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    type VARCHAR(10) NOT NULL CHECK (type IN ('market', 'limit', 'stop')),
    size NUMERIC(36, 18) NOT NULL,
    filled NUMERIC(36, 18) DEFAULT 0,
    trigger_price NUMERIC(36, 18),
    leverage INTEGER NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('open', 'filled', 'cancelled')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    filled_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    tx_hash VARCHAR(66)
);

CREATE INDEX IF NOT EXISTS idx_orders_address ON orders_history (address);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders_history (market_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders_history (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders_history (created_at);

-- Indexer state (for restart safety)
CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

