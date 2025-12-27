import { FastifyRequest, FastifyReply } from 'fastify';

interface CacheEntry {
    data: unknown;
    expiry: number;
}

// In-memory LRU cache
const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;

/**
 * Generate cache key from request
 */
function getCacheKey(request: FastifyRequest): string {
    const params = request.params as Record<string, string>;
    const query = request.query as Record<string, string>;

    let key = request.routeOptions.url || request.url;

    // Add params to key
    Object.entries(params).forEach(([k, v]) => {
        key += `:${k}=${v}`;
    });

    // Add relevant query params
    Object.entries(query).forEach(([k, v]) => {
        if (v) key += `:${k}=${v}`;
    });

    return key;
}

/**
 * Clean expired entries and enforce max size
 */
function cleanCache(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, entry] of cache.entries()) {
        if (entry.expiry < now) {
            cache.delete(key);
        }
    }

    // Enforce max size (remove oldest entries)
    if (cache.size > MAX_CACHE_SIZE) {
        const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
        keysToDelete.forEach(key => cache.delete(key));
    }
}

// Run cleanup every 30 seconds
setInterval(cleanCache, 30000);

/**
 * Cache configuration by route pattern
 */
const CACHE_CONFIG: Record<string, number> = {
    '/markets': 5000,           // 5 seconds
    '/prices': 5000,            // 5 seconds
    '/v2/markets': 5000,        // 5 seconds
    '/orderbook': 1000,         // 1 second
    '/orderbook/:marketId': 1000,
    '/v2/orderbook/:marketId': 1000,
    '/trades/:marketId': 2000,  // 2 seconds
    '/v2/trades/:marketId': 2000,
    '/funding/:marketId': 10000, // 10 seconds
    '/health': 1000,            // 1 second
};

/**
 * Get TTL for a route
 */
function getTTL(routePath: string): number | null {
    return CACHE_CONFIG[routePath] ?? null;
}

/**
 * Create cache middleware for a specific route
 */
export function createCacheMiddleware(ttlMs?: number) {
    return async function cacheMiddleware(
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<void> {
        const routePath = request.routeOptions.url || '';
        const configTtl = ttlMs ?? getTTL(routePath);

        // Skip caching if no TTL configured
        if (!configTtl) return;

        const cacheKey = getCacheKey(request);
        const cached = cache.get(cacheKey);

        if (cached && cached.expiry > Date.now()) {
            // Cache hit
            reply.header('X-Cache', 'HIT');
            reply.header('X-Cache-TTL', Math.ceil((cached.expiry - Date.now()) / 1000));
            return reply.send(cached.data);
        }

        // Cache miss - let the handler run and cache the response
        reply.header('X-Cache', 'MISS');
    };
}

/**
 * Store response in cache
 */
export function cacheResponse(
    request: FastifyRequest,
    data: unknown,
    ttlMs?: number
): void {
    const routePath = request.routeOptions.url || '';
    const configTtl = ttlMs ?? getTTL(routePath);

    if (!configTtl) return;

    const cacheKey = getCacheKey(request);
    cache.set(cacheKey, {
        data,
        expiry: Date.now() + configTtl,
    });
}

/**
 * Invalidate cache entries matching a pattern
 */
export function invalidateCache(pattern: string): void {
    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
        }
    }
}

/**
 * Clear all cache
 */
export function clearCache(): void {
    cache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; maxSize: number } {
    return {
        size: cache.size,
        maxSize: MAX_CACHE_SIZE,
    };
}
