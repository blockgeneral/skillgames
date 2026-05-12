import type { PlayerId } from '@skillgamez/shared';
import { getRedisClient } from './redisClient.js';

const SESSION_TTL_SECONDS = 3600; // 1 hour

export interface PlayerSession {
  userId: number;
  displayName: string;
  state: string;
  matchId?: string;
}

function sessionKey(playerId: PlayerId): string {
  return `session:${playerId}`;
}

export async function setSession(playerId: PlayerId, session: PlayerSession): Promise<void> {
  const redis = getRedisClient();
  const data: Record<string, string> = {
    userId: String(session.userId),
    displayName: session.displayName,
    state: session.state,
  };
  if (session.matchId) {
    data.matchId = session.matchId;
  }
  await redis.hset(sessionKey(playerId), data);
  await redis.expire(sessionKey(playerId), SESSION_TTL_SECONDS);
}

export async function getSession(playerId: PlayerId): Promise<PlayerSession | null> {
  const redis = getRedisClient();
  const data = await redis.hgetall(sessionKey(playerId));
  if (!data.userId) return null;
  return {
    userId: Number(data.userId),
    displayName: data.displayName!,
    state: data.state!,
    matchId: data.matchId || undefined,
  };
}

export async function removeSession(playerId: PlayerId): Promise<void> {
  const redis = getRedisClient();
  await redis.del(sessionKey(playerId));
}

export async function getActivePlayerCount(): Promise<number> {
  const redis = getRedisClient();
  const keys = await redis.keys('session:*');
  return keys.length;
}
