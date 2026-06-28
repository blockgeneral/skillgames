import type { PlayerId } from '@skillgamez/shared';
import type { Transaction } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';
import crypto from 'node:crypto';

const MAX_ENTRIES = 200;

function historyKey(playerId: PlayerId): string {
  return `txhistory:${playerId}`;
}

export async function addTransaction(
  playerId: PlayerId,
  data: Omit<Transaction, 'id' | 'timestamp'>,
): Promise<Transaction> {
  const redis = getRedisClient();
  const tx: Transaction = {
    id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
    ...data,
  };
  const key = historyKey(playerId);
  await redis.zadd(key, tx.timestamp, JSON.stringify(tx));
  // Trim to keep only the newest MAX_ENTRIES
  const count = await redis.zcard(key);
  if (count > MAX_ENTRIES) {
    await redis.zremrangebyrank(key, 0, count - MAX_ENTRIES - 1);
  }
  return tx;
}

export async function getTransactions(
  playerId: PlayerId,
  limit = 50,
  before?: number,
): Promise<Transaction[]> {
  const redis = getRedisClient();
  const key = historyKey(playerId);
  const maxScore = before ? before - 1 : '+inf';
  const raw = await redis.zrevrangebyscore(key, maxScore, '-inf', 'LIMIT', 0, limit);
  return raw.map((entry) => JSON.parse(entry) as Transaction);
}
