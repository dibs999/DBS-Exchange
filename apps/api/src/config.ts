import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PRICE_FEED =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin&vs_currencies=usd&include_24hr_change=true';

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  port: parseNumber(process.env.API_PORT, 3001),
  rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || '',
  engineAddress: process.env.ENGINE_ADDRESS || '',
  oracleAddress: process.env.ORACLE_ADDRESS || '',
  collateralAddress: process.env.COLLATERAL_ADDRESS || '',
  orderbookAddress: process.env.ORDERBOOK_ADDRESS || '',
  databaseUrl: process.env.DATABASE_URL || '',
  keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY || '',
  priceFeedUrl: process.env.PRICE_FEED_URL || DEFAULT_PRICE_FEED,
  marketId: process.env.MARKET_ID || 'ETH-USD',
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  rateLimitPerMinute: parseNumber(process.env.RATE_LIMIT_PER_MINUTE, 240),
  priceFeedTimeoutMs: parseNumber(process.env.PRICE_FEED_TIMEOUT_MS, 6_000),
  // Keeper configuration
  orderbookKeeperEnabled: process.env.ORDERBOOK_KEEPER_ENABLED !== 'false',
  orderbookKeeperInterval: parseNumber(process.env.ORDERBOOK_KEEPER_INTERVAL, 10_000),
  liquidationKeeperEnabled: process.env.LIQUIDATION_KEEPER_ENABLED !== 'false',
  liquidationKeeperInterval: parseNumber(process.env.LIQUIDATION_KEEPER_INTERVAL, 15_000),
  fundingKeeperEnabled: process.env.FUNDING_KEEPER_ENABLED !== 'false',
  fundingKeeperInterval: parseNumber(process.env.FUNDING_KEEPER_INTERVAL, 3_600_000), // 1 hour
  maxFundingRate: parseNumber(process.env.MAX_FUNDING_RATE, 0.0001), // 0.01% per hour max
};
