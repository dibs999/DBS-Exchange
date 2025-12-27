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
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export async function initDb() {
  if (!env.databaseUrl) {
    console.warn('DATABASE_URL not set; skipping database initialization');
    return;
  }

  const pool = getPool();
  
  try {
    // Read and execute schema
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema (split by semicolon for multiple statements)
    const statements = schema.split(';').filter(s => s.trim().length > 0);
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (err: any) {
          // Ignore "already exists" errors
          if (err.code !== '42P07' && !err.message.includes('already exists')) {
            console.warn('Schema statement warning:', err.message);
          }
        }
      }
    }
    console.log('Database schema initialized');
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

