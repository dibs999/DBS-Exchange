import pg from 'pg';
import { env } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }
    pool = new Pool({
      connectionString: env.databaseUrl,
      // Scalability: Increased from 20 to 100 for high-load scenarios
      max: 100,
      // Idle connections are closed after 30 seconds
      idleTimeoutMillis: 30000,
      // Connection timeout
      connectionTimeoutMillis: 5000,
      // Allow the pool to be used even if initial connection fails
      allowExitOnIdle: false,
    });

    // Connection health monitoring
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    pool.on('connect', () => {
      console.log('New database connection established');
    });
  }
  return pool;
}

async function executeSchema(pool: pg.Pool, schemaPath: string, schemaName: string) {
  const fs = await import('fs');
  const path = await import('path');
  const fullPath = path.join(process.cwd(), schemaPath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`${schemaName} schema file not found: ${fullPath}`);
    return;
  }

  const schema = fs.readFileSync(fullPath, 'utf-8');
  const statements = schema.split(';').filter(s => s.trim().length > 0);

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await pool.query(statement);
      } catch (err: any) {
        // Ignore "already exists" errors
        if (err.code !== '42P07' && !err.message.includes('already exists')) {
          console.warn(`${schemaName} schema statement warning:`, err.message);
        }
      }
    }
  }
  console.log(`${schemaName} schema initialized`);
}

export async function initDb() {
  if (!env.databaseUrl) {
    console.warn('DATABASE_URL not set; skipping database initialization');
    return;
  }

  const pool = getPool();

  try {
    // Initialize V1 schema
    await executeSchema(pool, 'src/db/schema.sql', 'V1');

    // Initialize V2 schema
    await executeSchema(pool, 'src/db/schema-v2.sql', 'V2');

    console.log('Database schemas initialized');
  } catch (err: any) {
    console.error('Failed to initialize database:', err);
    throw err;
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

