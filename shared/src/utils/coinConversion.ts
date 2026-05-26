import type { WagerAmount } from '../types/common.js';

export const COINS_PER_TON = 100;

export function tonToCoins(ton: WagerAmount): number {
  return ton * COINS_PER_TON;
}

export function coinsToTon(coins: number): number {
  return coins / COINS_PER_TON;
}

export function coinsToTonAfterFee(coins: number): number {
  return coinsToTon(coins) * 0.9; // minus 10% platform fee
}

export function formatCoins(coins: number): string {
  return `${coins.toLocaleString()} Coins`;
}
