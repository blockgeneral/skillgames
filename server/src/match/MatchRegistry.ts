import type { PlayerId, MatchId, WagerAmount, Timestamp } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';
import crypto from 'node:crypto';

export type MatchStatus = 'waiting_for_deposits' | 'in_progress' | 'completed' | 'cancelled';

export interface ActiveMatch {
  matchId: MatchId;
  playerA: PlayerId;
  playerB: PlayerId;
  wagerAmount: WagerAmount;
  status: MatchStatus;
  createdAt: Timestamp;
  seed: string;
}

const MATCH_TTL_SECONDS = 3600; // 1 hour

function matchKey(matchId: MatchId): string {
  return `match:${matchId}`;
}

function playerMatchKey(playerId: PlayerId): string {
  return `player_match:${playerId}`;
}

export class MatchRegistry {
  async create(matchId: MatchId, playerA: PlayerId, playerB: PlayerId, wagerAmount: WagerAmount): Promise<ActiveMatch> {
    const redis = getRedisClient();
    const match: ActiveMatch = {
      matchId,
      playerA,
      playerB,
      wagerAmount,
      status: 'waiting_for_deposits',
      createdAt: Date.now() as Timestamp,
      seed: crypto.randomUUID(),
    };

    await redis.set(matchKey(matchId), JSON.stringify(match), 'EX', MATCH_TTL_SECONDS);
    await redis.set(playerMatchKey(playerA), matchId, 'EX', MATCH_TTL_SECONDS);
    await redis.set(playerMatchKey(playerB), matchId, 'EX', MATCH_TTL_SECONDS);

    return match;
  }

  async get(matchId: MatchId): Promise<ActiveMatch | null> {
    const redis = getRedisClient();
    const raw = await redis.get(matchKey(matchId));
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async getByPlayer(playerId: PlayerId): Promise<ActiveMatch | null> {
    const redis = getRedisClient();
    const matchId = await redis.get(playerMatchKey(playerId));
    if (!matchId) return null;
    return this.get(matchId as MatchId);
  }

  async updateStatus(matchId: MatchId, status: MatchStatus): Promise<void> {
    const match = await this.get(matchId);
    if (!match) return;
    match.status = status;
    const redis = getRedisClient();
    await redis.set(matchKey(matchId), JSON.stringify(match), 'EX', MATCH_TTL_SECONDS);
  }

  async remove(matchId: MatchId): Promise<void> {
    const match = await this.get(matchId);
    if (!match) return;
    const redis = getRedisClient();
    await redis.del(matchKey(matchId));
    await redis.del(playerMatchKey(match.playerA));
    await redis.del(playerMatchKey(match.playerB));
  }
}
