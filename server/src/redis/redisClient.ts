import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return client;
}

export async function connectRedis(url: string, maxRetries = 3): Promise<Redis> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 1000, 3000);
        },
        lazyConnect: true,
      });

      await redis.connect();
      client = redis;

      redis.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
      });

      return redis;
    } catch (err) {
      console.error(`[Redis] Connection attempt ${attempt}/${maxRetries} failed:`, (err as Error).message);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Failed to connect to Redis after ${maxRetries} attempts`);
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
