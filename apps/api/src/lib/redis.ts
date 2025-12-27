import { createClient, RedisClientType } from 'redis';
import { env } from '../config.js';

let client: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;
let publisher: RedisClientType | null = null;

const messageHandlers = new Map<string, Set<(message: string) => void>>();

/**
 * Get the main Redis client for caching operations
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
    if (!env.redisUrl) {
        return null;
    }

    if (!client) {
        client = createClient({
            url: env.redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('Redis: Max reconnection attempts reached');
                        return false;
                    }
                    return Math.min(retries * 100, 3000);
                },
            },
        });

        client.on('error', (err) => console.error('Redis client error:', err));
        client.on('connect', () => console.log('Redis client connected'));
        client.on('reconnecting', () => console.log('Redis client reconnecting...'));

        await client.connect();
    }

    return client;
}

/**
 * Get Redis subscriber for Pub/Sub
 */
export async function getRedisSubscriber(): Promise<RedisClientType | null> {
    if (!env.redisUrl) {
        return null;
    }

    if (!subscriber) {
        subscriber = createClient({ url: env.redisUrl });
        subscriber.on('error', (err) => console.error('Redis subscriber error:', err));
        await subscriber.connect();
    }

    return subscriber;
}

/**
 * Get Redis publisher for Pub/Sub
 */
export async function getRedisPublisher(): Promise<RedisClientType | null> {
    if (!env.redisUrl) {
        return null;
    }

    if (!publisher) {
        publisher = createClient({ url: env.redisUrl });
        publisher.on('error', (err) => console.error('Redis publisher error:', err));
        await publisher.connect();
    }

    return publisher;
}

/**
 * Subscribe to a Redis channel
 */
export async function subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    const sub = await getRedisSubscriber();
    if (!sub) return;

    if (!messageHandlers.has(channel)) {
        messageHandlers.set(channel, new Set());
        await sub.subscribe(channel, (message) => {
            const handlers = messageHandlers.get(channel);
            if (handlers) {
                handlers.forEach((h) => h(message));
            }
        });
    }

    messageHandlers.get(channel)!.add(handler);
}

/**
 * Publish a message to a Redis channel
 */
export async function publish(channel: string, message: string): Promise<void> {
    const pub = await getRedisPublisher();
    if (!pub) return;

    await pub.publish(channel, message);
}

/**
 * Close all Redis connections
 */
export async function closeRedis(): Promise<void> {
    if (subscriber) {
        await subscriber.quit();
        subscriber = null;
    }
    if (publisher) {
        await publisher.quit();
        publisher = null;
    }
    if (client) {
        await client.quit();
        client = null;
    }
    messageHandlers.clear();
}

// WebSocket broadcast channels
export const WS_CHANNELS = {
    MARKET_UPDATE: 'ws:market',
    ORDERBOOK_UPDATE: 'ws:orderbook',
    TRADES_UPDATE: 'ws:trades',
    POSITIONS_UPDATE: 'ws:positions',
    ORDERS_UPDATE: 'ws:orders',
    PRICES_UPDATE: 'ws:prices',
} as const;

/**
 * Broadcast WebSocket message via Redis Pub/Sub
 * This enables horizontal scaling - multiple API instances can receive the same messages
 */
export async function broadcastWsMessage(channel: string, data: unknown): Promise<void> {
    const message = JSON.stringify(data);
    await publish(channel, message);
}
