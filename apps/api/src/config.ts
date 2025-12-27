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

// Secrets Manager Integration (optional)
async function getSecret(key: string, fallback: string): Promise<string> {
  // Check for AWS Secrets Manager
  if (process.env.AWS_SECRETS_MANAGER_REGION && process.env.AWS_SECRETS_MANAGER_SECRET_NAME) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({ region: process.env.AWS_SECRETS_MANAGER_REGION });
      const command = new GetSecretValueCommand({
        SecretId: process.env.AWS_SECRETS_MANAGER_SECRET_NAME,
      });
      const response = await client.send(command);
      const secrets = JSON.parse(response.SecretString || '{}');
      if (secrets[key]) {
        return secrets[key];
      }
    } catch (err) {
      console.warn(`Failed to fetch secret ${key} from AWS Secrets Manager:`, err);
    }
  }

  // Check for HashiCorp Vault
  if (process.env.VAULT_ADDR && process.env.VAULT_TOKEN) {
    try {
      const response = await fetch(`${process.env.VAULT_ADDR}/v1/secret/data/${key}`, {
        headers: {
          'X-Vault-Token': process.env.VAULT_TOKEN,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.data?.value) {
          return data.data.data.value;
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch secret ${key} from Vault:`, err);
    }
  }

  // Fallback to environment variable
  const envValue = process.env[key];
  if (envValue) {
    // Warn if sensitive key is in plaintext (development only)
    if (process.env.NODE_ENV !== 'production' && (key.includes('PRIVATE_KEY') || key.includes('SECRET'))) {
      console.warn(`⚠️  WARNING: ${key} is loaded from environment variable. Use a secrets manager in production!`);
    }
    return envValue;
  }

  return fallback;
}

// Synchronous version for immediate access (uses env vars only)
function getSecretSync(key: string, fallback: string): string {
  const value = process.env[key];
  if (value && process.env.NODE_ENV !== 'production' && (key.includes('PRIVATE_KEY') || key.includes('SECRET'))) {
    console.warn(`⚠️  WARNING: ${key} is loaded from environment variable. Use a secrets manager in production!`);
  }
  return value || fallback;
}

export const env = {
  port: parseNumber(process.env.API_PORT, 3001),
  rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || '',
  baseRpcUrl: process.env.BASE_RPC_URL || '',
  chainId: parseNumber(process.env.CHAIN_ID, 11155111), // Sepolia default, 8453 for Base
  engineAddress: process.env.ENGINE_ADDRESS || '',
  engineV2Address: process.env.ENGINE_V2_ADDRESS || '',
  oracleAddress: process.env.ORACLE_ADDRESS || '',
  oracleRouterAddress: process.env.ORACLE_ROUTER_ADDRESS || '',
  collateralAddress: process.env.COLLATERAL_ADDRESS || '',
  orderbookAddress: process.env.ORDERBOOK_ADDRESS || '',
  orderbookV2Address: process.env.ORDERBOOK_V2_ADDRESS || '',
  vaultAddress: process.env.VAULT_ADDRESS || '',
  insuranceAddress: process.env.INSURANCE_ADDRESS || '',
  databaseUrl: process.env.DATABASE_URL || '',
  keeperPrivateKey: getSecretSync('KEEPER_PRIVATE_KEY', ''),
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
  // V2 Keeper configuration
  auctionKeeperEnabled: process.env.AUCTION_KEEPER_ENABLED !== 'false',
  auctionKeeperInterval: parseNumber(process.env.AUCTION_KEEPER_INTERVAL, 60_000), // 1 minute
  stopTriggerKeeperEnabled: process.env.STOP_TRIGGER_KEEPER_ENABLED !== 'false',
  stopTriggerKeeperInterval: parseNumber(process.env.STOP_TRIGGER_KEEPER_INTERVAL, 10_000), // 10 seconds
  oracleRouterKeeperEnabled: process.env.ORACLE_ROUTER_KEEPER_ENABLED !== 'false',
  oracleRouterKeeperInterval: parseNumber(process.env.ORACLE_ROUTER_KEEPER_INTERVAL, 30_000), // 30 seconds
  // Proof of Reserves configuration
  proofOfReservesAddress: process.env.PROOF_OF_RESERVES_ADDRESS || '',
  reservesKeeperEnabled: process.env.RESERVES_KEEPER_ENABLED !== 'false',
  reservesKeeperInterval: parseNumber(process.env.RESERVES_KEEPER_INTERVAL, 3_600_000), // 1 hour
  // Redis configuration for horizontal scaling
  redisUrl: process.env.REDIS_URL || '',
};

// Export async function to load secrets at startup (optional)
export async function loadSecrets(): Promise<void> {
  if (env.keeperPrivateKey) {
    // Already loaded synchronously, but validate
    if (process.env.NODE_ENV === 'production' && !process.env.AWS_SECRETS_MANAGER_REGION && !process.env.VAULT_ADDR) {
      console.warn('⚠️  WARNING: KEEPER_PRIVATE_KEY is in environment variable. Consider using a secrets manager in production!');
    }
  }

  // Optionally reload from secrets manager
  if (process.env.AWS_SECRETS_MANAGER_REGION || process.env.VAULT_ADDR) {
    try {
      const newKey = await getSecret('KEEPER_PRIVATE_KEY', env.keeperPrivateKey);
      if (newKey && newKey !== env.keeperPrivateKey) {
        (env as any).keeperPrivateKey = newKey;
        console.log('✅ Secrets loaded from secrets manager');
      }
    } catch (err) {
      console.error('Failed to load secrets:', err);
    }
  }
}
