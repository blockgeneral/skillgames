import type { MatchId, PlayerId, Timestamp } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';

export interface InputLogEntry {
  matchId: MatchId;
  playerId: PlayerId;
  roundNumber: number;
  promptNumber: number;
  inputType: 'tap' | 'swipe' | 'false_start';
  timestamp: Timestamp;
  serverReceivedAt: Timestamp;
  data: Record<string, number | string | undefined>;
  isTrusted: boolean;
  reactionMs: number | null;
  result: 'hit' | 'miss' | 'false_start' | 'timeout' | 'rejected';
}

const LOG_TTL_SECONDS = 86400; // 24 hours

export async function logInput(entry: InputLogEntry): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `input_log:${entry.matchId}`;
    await redis.rpush(key, JSON.stringify(entry));
    await redis.expire(key, LOG_TTL_SECONDS);
  } catch {
    // Don't let logging failures break the game
  }
}
