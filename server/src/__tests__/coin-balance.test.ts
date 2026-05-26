import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectRedis, disconnectRedis, getRedisClient } from '../redis/redisClient.js';
import { CoinBalanceManager } from '../wallet/CoinBalance.js';
import type { PlayerId, MatchId } from '@skillgamez/shared';

let coinBalance: CoinBalanceManager;

const PLAYER_A = 'tg:coin-test-1' as PlayerId;
const PLAYER_B = 'tg:coin-test-2' as PlayerId;
const MATCH_ID = 'test-match-coin' as MatchId;

beforeAll(async () => {
  await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
});

beforeEach(async () => {
  coinBalance = new CoinBalanceManager();
  const redis = getRedisClient();
  for (const pattern of ['balance:*', 'transactions:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
});

afterAll(async () => {
  await disconnectRedis();
});

describe('CoinBalanceManager', () => {
  it('initial grant: new player gets 1000 Coins on first access', async () => {
    const bal = await coinBalance.getBalance(PLAYER_A);
    expect(bal).toBe(1000);

    const history = await coinBalance.getHistory(PLAYER_A);
    expect(history).toHaveLength(1);
    expect(history[0]!.reason).toBe('initial_grant');
    expect(history[0]!.amount).toBe(1000);
    expect(history[0]!.balanceAfter).toBe(1000);
  });

  it('debit: player with 1000 Coins, debit 100 → balance 900', async () => {
    await coinBalance.getBalance(PLAYER_A); // trigger initial grant
    const newBal = await coinBalance.debit(PLAYER_A, 100, 'wager_debit', MATCH_ID);
    expect(newBal).toBe(900);

    const bal = await coinBalance.getBalance(PLAYER_A);
    expect(bal).toBe(900);
  });

  it('credit: player with 1000 Coins, credit 200 → balance 1200', async () => {
    await coinBalance.getBalance(PLAYER_A);
    const newBal = await coinBalance.credit(PLAYER_A, 200, 'wager_win', MATCH_ID);
    expect(newBal).toBe(1200);
  });

  it('insufficient funds: player with 50 Coins tries to debit 100 → rejected', async () => {
    await coinBalance.getBalance(PLAYER_A); // 1000
    await coinBalance.debit(PLAYER_A, 950, 'wager_debit'); // leaves 50
    await expect(coinBalance.debit(PLAYER_A, 100, 'wager_debit')).rejects.toThrow('Insufficient balance');
  });

  it('canAfford checks correctly', async () => {
    await coinBalance.getBalance(PLAYER_A); // 1000
    expect(await coinBalance.canAfford(PLAYER_A, 1000)).toBe(true);
    expect(await coinBalance.canAfford(PLAYER_A, 1001)).toBe(false);
  });

  it('match wager flow: winner gets both wagers', async () => {
    // Both start with 1000
    await coinBalance.getBalance(PLAYER_A);
    await coinBalance.getBalance(PLAYER_B);

    // Debit both for wager of 100
    await coinBalance.debit(PLAYER_A, 100, 'wager_debit', MATCH_ID);
    await coinBalance.debit(PLAYER_B, 100, 'wager_debit', MATCH_ID);

    expect(await coinBalance.getBalance(PLAYER_A)).toBe(900);
    expect(await coinBalance.getBalance(PLAYER_B)).toBe(900);

    // Player A wins — credit 200 (both wagers)
    await coinBalance.credit(PLAYER_A, 200, 'wager_win', MATCH_ID);

    expect(await coinBalance.getBalance(PLAYER_A)).toBe(1100);
    expect(await coinBalance.getBalance(PLAYER_B)).toBe(900);
  });

  it('refund on cancel: both refunded to original balance', async () => {
    await coinBalance.getBalance(PLAYER_A);
    await coinBalance.getBalance(PLAYER_B);

    await coinBalance.debit(PLAYER_A, 100, 'wager_debit', MATCH_ID);
    await coinBalance.debit(PLAYER_B, 100, 'wager_debit', MATCH_ID);

    // Match cancelled — refund both
    await coinBalance.credit(PLAYER_A, 100, 'wager_refund', MATCH_ID);
    await coinBalance.credit(PLAYER_B, 100, 'wager_refund', MATCH_ID);

    expect(await coinBalance.getBalance(PLAYER_A)).toBe(1000);
    expect(await coinBalance.getBalance(PLAYER_B)).toBe(1000);
  });

  it('transaction history: shows entries in correct order', async () => {
    await coinBalance.getBalance(PLAYER_A); // initial_grant
    await coinBalance.debit(PLAYER_A, 100, 'wager_debit', MATCH_ID);
    await coinBalance.credit(PLAYER_A, 200, 'wager_win', MATCH_ID);

    const history = await coinBalance.getHistory(PLAYER_A);
    expect(history).toHaveLength(3);
    // Most recent first (lpush)
    expect(history[0]!.reason).toBe('wager_win');
    expect(history[0]!.amount).toBe(200);
    expect(history[0]!.balanceAfter).toBe(1100);
    expect(history[1]!.reason).toBe('wager_debit');
    expect(history[1]!.amount).toBe(-100);
    expect(history[2]!.reason).toBe('initial_grant');
  });

  it('initial grant is idempotent (no double-grant on race)', async () => {
    // Call getBalance twice concurrently
    const [bal1, bal2] = await Promise.all([
      coinBalance.getBalance(PLAYER_A),
      coinBalance.getBalance(PLAYER_A),
    ]);
    expect(bal1).toBe(1000);
    expect(bal2).toBe(1000);

    // Balance should still be 1000, not 2000
    const finalBal = await coinBalance.getBalance(PLAYER_A);
    expect(finalBal).toBe(1000);
  });
});
