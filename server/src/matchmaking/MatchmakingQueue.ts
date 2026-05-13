import type { PlayerId, MatchId, WagerAmount } from '@skillgamez/shared';
import { VALID_WAGER_AMOUNTS } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';
import crypto from 'node:crypto';

export interface QueueMatchResult {
  matchId: MatchId;
  playerA: PlayerId;
  playerB: PlayerId;
  wagerAmount: WagerAmount;
}

function queueKey(wagerAmount: WagerAmount): string {
  return `queue:${wagerAmount}`;
}

export class MatchmakingQueue {
  private playerTier = new Map<string, WagerAmount>();

  async join(playerId: PlayerId, wagerAmount: WagerAmount): Promise<QueueMatchResult | null> {
    // Remove from any existing queue first
    await this.leave(playerId);

    const redis = getRedisClient();
    const key = queueKey(wagerAmount);

    // Check if someone is already waiting
    const waiting = await redis.lpop(key);
    if (waiting && waiting !== playerId) {
      // Match found
      const matchId = crypto.randomUUID() as MatchId;
      this.playerTier.delete(playerId);
      this.playerTier.delete(waiting);
      return {
        matchId,
        playerA: waiting as PlayerId,
        playerB: playerId,
        wagerAmount,
      };
    }

    // If we popped ourselves (shouldn't happen after leave, but be safe)
    // or nobody was waiting — add to queue
    await redis.rpush(key, playerId);
    this.playerTier.set(playerId, wagerAmount);
    return null;
  }

  async leave(playerId: PlayerId): Promise<void> {
    const tier = this.playerTier.get(playerId);
    if (tier !== undefined) {
      const redis = getRedisClient();
      await redis.lrem(queueKey(tier), 0, playerId);
      this.playerTier.delete(playerId);
    } else {
      // Exhaustive cleanup — player might be in a queue we don't track locally
      const redis = getRedisClient();
      for (const amt of VALID_WAGER_AMOUNTS) {
        await redis.lrem(queueKey(amt), 0, playerId);
      }
    }
  }

  async getQueueSizes(): Promise<Record<string, number>> {
    const redis = getRedisClient();
    const sizes: Record<string, number> = {};
    for (const amt of VALID_WAGER_AMOUNTS) {
      sizes[String(amt)] = await redis.llen(queueKey(amt));
    }
    return sizes;
  }

  isInQueue(playerId: PlayerId): boolean {
    return this.playerTier.has(playerId);
  }

  async getPosition(playerId: PlayerId, wagerAmount: WagerAmount): Promise<number> {
    const redis = getRedisClient();
    const members = await redis.lrange(queueKey(wagerAmount), 0, -1);
    const idx = members.indexOf(playerId);
    return idx >= 0 ? idx + 1 : 0;
  }
}
