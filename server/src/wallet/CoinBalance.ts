import type { PlayerId, MatchId, Timestamp } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';
import crypto from 'node:crypto';

const INITIAL_GRANT_COINS = 1000;
const MAX_HISTORY_ENTRIES = 100;

export type TransactionReason = 'deposit' | 'withdrawal' | 'wager_debit' | 'wager_win' | 'wager_refund' | 'initial_grant';

export interface CoinTransaction {
  id: string;
  playerId: PlayerId;
  amount: number; // positive = credit, negative = debit
  reason: TransactionReason;
  matchId?: MatchId;
  balanceAfter: number;
  timestamp: Timestamp;
}

function balanceKey(playerId: PlayerId): string {
  return `balance:${playerId}`;
}

function txKey(playerId: PlayerId): string {
  return `transactions:${playerId}`;
}

export class CoinBalanceManager {
  async getBalance(playerId: PlayerId): Promise<number> {
    const redis = getRedisClient();
    const raw = await redis.get(balanceKey(playerId));
    if (raw === null) {
      // First-time player — grant initial coins
      return this.grantInitial(playerId);
    }
    return Number(raw);
  }

  async credit(playerId: PlayerId, amount: number, reason: TransactionReason, matchId?: MatchId): Promise<number> {
    if (amount <= 0) throw new Error('Credit amount must be positive');
    const redis = getRedisClient();

    // Ensure balance key exists
    const exists = await redis.exists(balanceKey(playerId));
    if (!exists) await this.grantInitial(playerId);

    const raw = await redis.incrbyfloat(balanceKey(playerId), amount);
    const newBalance = Number(raw);
    await this.recordTransaction(playerId, amount, reason, newBalance, matchId);
    return newBalance;
  }

  async debit(playerId: PlayerId, amount: number, reason: TransactionReason, matchId?: MatchId): Promise<number> {
    if (amount <= 0) throw new Error('Debit amount must be positive');
    const redis = getRedisClient();

    // Ensure balance key exists
    const exists = await redis.exists(balanceKey(playerId));
    if (!exists) await this.grantInitial(playerId);

    // Atomic check-and-debit via Lua script
    const script = `
      local key = KEYS[1]
      local amount = tonumber(ARGV[1])
      local current = tonumber(redis.call('get', key) or '0')
      if current < amount then
        return nil
      end
      return redis.call('incrbyfloat', key, -amount)
    `;
    const result = await redis.eval(script, 1, balanceKey(playerId), amount);
    if (result === null) {
      throw new Error('Insufficient balance');
    }
    const newBalance = Number(result);
    await this.recordTransaction(playerId, -amount, reason, newBalance, matchId);
    return newBalance;
  }

  async canAfford(playerId: PlayerId, amount: number): Promise<boolean> {
    const balance = await this.getBalance(playerId);
    return balance >= amount;
  }

  async getHistory(playerId: PlayerId, limit = 20): Promise<CoinTransaction[]> {
    const redis = getRedisClient();
    const raw = await redis.lrange(txKey(playerId), 0, limit - 1);
    return raw.map((entry) => JSON.parse(entry));
  }

  /**
   * Reset balance to 0 when a real wallet is connected.
   * If the player already received the mock grant, this removes it.
   */
  async resetForWallet(playerId: PlayerId): Promise<number> {
    const redis = getRedisClient();
    await redis.set(balanceKey(playerId), 0);
    return 0;
  }

  private async grantInitial(playerId: PlayerId): Promise<number> {
    const redis = getRedisClient();
    // Only grant mock coins if no real wallet is connected
    const hasWallet = await redis.exists(`wallet:${playerId}`);
    const grantAmount = hasWallet ? 0 : INITIAL_GRANT_COINS;
    // Use SETNX to avoid double-granting on race
    const wasSet = await redis.setnx(balanceKey(playerId), grantAmount);
    if (wasSet && grantAmount > 0) {
      await this.recordTransaction(playerId, grantAmount, 'initial_grant', grantAmount);
    }
    const balance = await redis.get(balanceKey(playerId));
    return Number(balance);
  }

  private async recordTransaction(
    playerId: PlayerId,
    amount: number,
    reason: TransactionReason,
    balanceAfter: number,
    matchId?: MatchId,
  ): Promise<void> {
    const redis = getRedisClient();
    const tx: CoinTransaction = {
      id: crypto.randomUUID(),
      playerId,
      amount,
      reason,
      balanceAfter,
      timestamp: Date.now() as Timestamp,
      ...(matchId ? { matchId } : {}),
    };
    await redis.lpush(txKey(playerId), JSON.stringify(tx));
    await redis.ltrim(txKey(playerId), 0, MAX_HISTORY_ENTRIES - 1);
  }
}
