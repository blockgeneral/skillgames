import { describe, it, expect } from 'vitest';
import { generateMatchRounds, generatePromptHash } from '../generateRound.js';
import { QUICK_DRAW_CONSTANTS } from '../../types/quickdraw.js';
import type { PromptShape, PromptColor } from '../../types/quickdraw.js';

const SEED_A = 'test-seed-alpha-1234567890abcdef';
const SEED_B = 'test-seed-beta-fedcba0987654321';

describe('generateMatchRounds', () => {
  it('produces exactly 5 rounds', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    expect(rounds).toHaveLength(5);
  });

  it('same seed produces identical rounds across multiple calls', () => {
    const a = generateMatchRounds(SEED_A, 1);
    const b = generateMatchRounds(SEED_A, 1);
    expect(a).toEqual(b);
  });

  it('different seeds produce different rounds', () => {
    const a = generateMatchRounds(SEED_A, 1);
    const b = generateMatchRounds(SEED_B, 1);
    // At minimum, positions or delays should differ
    const aDelays = a.map((r) => r.delay);
    const bDelays = b.map((r) => r.delay);
    expect(aDelays).not.toEqual(bDelays);
  });

  it('all delays are within [MIN_DELAY_MS, MAX_DELAY_MS]', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const r of rounds) {
      expect(r.delay).toBeGreaterThanOrEqual(QUICK_DRAW_CONSTANTS.MIN_DELAY_MS);
      expect(r.delay).toBeLessThanOrEqual(QUICK_DRAW_CONSTANTS.MAX_DELAY_MS);
    }
  });

  it('all positions are within [0.15, 0.85]', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const r of rounds) {
      expect(r.prompt.position.x).toBeGreaterThanOrEqual(0.15);
      expect(r.prompt.position.x).toBeLessThanOrEqual(0.85);
      expect(r.prompt.position.y).toBeGreaterThanOrEqual(0.15);
      expect(r.prompt.position.y).toBeLessThanOrEqual(0.85);
    }
  });

  it('all shapes are valid PromptShape values', () => {
    const validShapes: PromptShape[] = ['circle', 'square', 'triangle'];
    // Run multiple seeds to increase shape coverage
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const r of rounds) {
        expect(validShapes).toContain(r.prompt.shape);
      }
    }
  });

  it('all colors are valid PromptColor values', () => {
    const validColors: PromptColor[] = ['red', 'blue', 'green', 'yellow'];
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const r of rounds) {
        expect(validColors).toContain(r.prompt.color);
      }
    }
  });

  it('prompt hash matches recomputation (commitment scheme)', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const r of rounds) {
      const { promptHash: _hash, ...configWithoutHash } = r;
      const recomputed = generatePromptHash(configWithoutHash);
      expect(r.promptHash).toBe(recomputed);
    }
  });

  it('round numbers are sequential 1..5', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (let i = 0; i < 5; i++) {
      expect(rounds[i]!.roundNumber).toBe(i + 1);
    }
  });

  it('prompt size varies by wager amount', () => {
    const low = generateMatchRounds(SEED_A, 0.5);
    const high = generateMatchRounds(SEED_A, 25);
    expect(low[0]!.prompt.size).toBe(0.12);
    expect(high[0]!.prompt.size).toBe(0.06);
    expect(low[0]!.prompt.size).toBeGreaterThan(high[0]!.prompt.size);
  });
});
