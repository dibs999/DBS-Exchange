import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config.js';
import { RateLimitError } from './errorHandler.js';
import { getValidatedClientIp } from './ipValidation.js';

type RateEntry = { count: number; resetAt: number };

// In-memory rate limit store (fallback if Redis not available)
const inMemoryStore = new Map<string, RateEntry>();

// Redis client (optional)
let redisClient: any = null;

async function getRedisClient() {
  if (redisClient) return redisClient;

  try {
    const redis = await import('ioredis');
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      redisClient = new redis.default(redisUrl);
      redisClient.on('error', (err: Error) => {
        console.warn('Redis connection error, falling back to in-memory rate limiting:', err.message);
        redisClient = null;
      });
      return redisClient;
    }
  } catch (err) {
    // Redis not available, use in-memory
  }
  return null;
}

// Keeper IP whitelist (bypass rate limiting)
const KEEPER_IPS = new Set<string>(
  (process.env.KEEPER_IPS || '').split(',').filter(Boolean).map((ip) => ip.trim())
);

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipIf?: (request: FastifyRequest) => boolean;
}

export async function checkRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  config: RateLimitConfig
): Promise<void> {
  // Skip if condition is met
  if (config.skipIf && config.skipIf(request)) {
    return;
  }

  // Skip for keeper IPs
  const clientIp = getClientIp(request);
  if (KEEPER_IPS.has(clientIp)) {
    return;
  }

  const key = config.keyGenerator ? config.keyGenerator(request) : `rate_limit:${clientIp}`;
  const now = Date.now();

  // Try Redis first
  const redis = await getRedisClient();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, config.windowMs);
      }

      const ttl = await redis.pttl(key);
      const resetAt = now + ttl;

      reply.header('X-RateLimit-Limit', String(config.maxRequests));
      reply.header('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - count)));
      reply.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

      if (count > config.maxRequests) {
        throw new RateLimitError(
          `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`
        );
      }
      return;
    } catch (err: any) {
      // Fallback to in-memory if Redis fails
      if (err instanceof RateLimitError) throw err;
      console.warn('Redis rate limit check failed, falling back to in-memory:', err.message);
    }
  }

  // Fallback to in-memory
  const entry = inMemoryStore.get(key) ?? { count: 0, resetAt: now + config.windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + config.windowMs;
  }
  entry.count += 1;
  inMemoryStore.set(key, entry);

  // Cleanup old entries periodically
  if (inMemoryStore.size > 10000) {
    for (const [k, v] of inMemoryStore.entries()) {
      if (now > v.resetAt) {
        inMemoryStore.delete(k);
      }
    }
  }

  reply.header('X-RateLimit-Limit', String(config.maxRequests));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - entry.count)));
  reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > config.maxRequests) {
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`
    );
  }
}

function getClientIp(request: FastifyRequest): string {
  return getValidatedClientIp(request);
}

// Default rate limit config
export const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 60_000, // 1 minute
  maxRequests: env.rateLimitPerMinute,
  keyGenerator: (request) => {
    const ip = getClientIp(request);
    const path = request.url.split('?')[0];
    return `rate_limit:${ip}:${path}`;
  },
  skipIf: (request) => {
    // Skip WebSocket upgrade path
    return typeof request.url === 'string' && request.url.startsWith('/ws');
  },
};

// Stricter rate limit for expensive endpoints
export const strictRateLimitConfig: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: Math.floor(env.rateLimitPerMinute / 2),
  keyGenerator: (request) => {
    const ip = getClientIp(request);
    return `rate_limit:strict:${ip}`;
  },
};

// Rate limit middleware factory
export function createRateLimitMiddleware(config: RateLimitConfig = defaultRateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await checkRateLimit(request, reply, config);
  };
}

