import type { PlayerId, MatchId, WagerAmount, Timestamp } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';
import crypto from 'node:crypto';

export interface PendingChallenge {
  challengeCode: string;
  creatorId: PlayerId;
  wagerAmount: WagerAmount;
  createdAt: Timestamp;
}

export interface ChallengeMatchResult {
  matchId: MatchId;
  playerA: PlayerId;
  playerB: PlayerId;
  wagerAmount: WagerAmount;
}

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I for readability

function challengeKey(code: string): string {
  return `challenge:${code}`;
}

function playerChallengeKey(playerId: PlayerId): string {
  return `player_challenge:${playerId}`;
}

export class DirectChallenge {
  create(playerId: PlayerId, wagerAmount: WagerAmount): string {
    const code = generateCode();
    const redis = getRedisClient();
    const data: PendingChallenge = {
      challengeCode: code,
      creatorId: playerId,
      wagerAmount,
      createdAt: Date.now() as Timestamp,
    };

    // Fire-and-forget Redis writes — they complete before the TTL matters
    void redis.set(challengeKey(code), JSON.stringify(data), 'EX', CHALLENGE_TTL_SECONDS);
    void redis.set(playerChallengeKey(playerId), code, 'EX', CHALLENGE_TTL_SECONDS);

    return code;
  }

  async join(playerId: PlayerId, challengeCode: string): Promise<ChallengeMatchResult | null> {
    const redis = getRedisClient();
    const raw = await redis.get(challengeKey(challengeCode));
    if (!raw) return null;

    const challenge: PendingChallenge = JSON.parse(raw);
    if (challenge.creatorId === playerId) return null; // Can't join own challenge

    // Clean up
    await redis.del(challengeKey(challengeCode));
    await redis.del(playerChallengeKey(challenge.creatorId));

    const matchId = crypto.randomUUID() as MatchId;
    return {
      matchId,
      playerA: challenge.creatorId,
      playerB: playerId,
      wagerAmount: challenge.wagerAmount,
    };
  }

  async cancel(playerId: PlayerId): Promise<boolean> {
    const redis = getRedisClient();
    const code = await redis.get(playerChallengeKey(playerId));
    if (!code) return false;

    await redis.del(challengeKey(code));
    await redis.del(playerChallengeKey(playerId));
    return true;
  }

  async getPending(challengeCode: string): Promise<PendingChallenge | null> {
    const redis = getRedisClient();
    const raw = await redis.get(challengeKey(challengeCode));
    if (!raw) return null;
    return JSON.parse(raw);
  }
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
