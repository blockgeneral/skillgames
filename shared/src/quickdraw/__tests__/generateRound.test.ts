import { describe, it, expect } from 'vitest';
import { generateMatchRounds, generatePromptHash } from '../generateRound.js';
import { QUICK_DRAW_CONSTANTS } from '../../types/quickdraw.js';
import type { PromptShape, PromptColor, SwipeDirection } from '../../types/quickdraw.js';
import { sha256 } from '../sha256.js';

const SEED_A = 'test-seed-alpha-1234567890abcdef';
const SEED_B = 'test-seed-beta-fedcba0987654321';

describe('generateMatchRounds', () => {
  it('produces exactly 3 rounds', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    expect(rounds).toHaveLength(3);
  });

  it('each round contains exactly 8 prompts', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      expect(round.prompts).toHaveLength(8);
    }
  });

  it('same seed produces identical rounds across multiple calls', () => {
    const a = generateMatchRounds(SEED_A, 1);
    const b = generateMatchRounds(SEED_A, 1);
    expect(a).toEqual(b);
  });

  it('different seeds produce different rounds', () => {
    const a = generateMatchRounds(SEED_A, 1);
    const b = generateMatchRounds(SEED_B, 1);
    const aHashes = a.map((r) => r.roundHash);
    const bHashes = b.map((r) => r.roundHash);
    expect(aHashes).not.toEqual(bHashes);
  });

  it('first prompt delay in [1500, 3000]', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      const first = round.prompts[0]!;
      expect(first.delay).toBeGreaterThanOrEqual(QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MIN_DELAY_MS);
      expect(first.delay).toBeLessThanOrEqual(QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MAX_DELAY_MS);
    }
  });

  it('subsequent prompt delays in [300, 1200]', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      for (let i = 1; i < round.prompts.length; i++) {
        const p = round.prompts[i]!;
        expect(p.delay).toBeGreaterThanOrEqual(QUICK_DRAW_CONSTANTS.INTER_PROMPT_MIN_DELAY_MS);
        expect(p.delay).toBeLessThanOrEqual(QUICK_DRAW_CONSTANTS.INTER_PROMPT_MAX_DELAY_MS);
      }
    }
  });

  it('all positions are within [0.15, 0.85]', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      for (const p of round.prompts) {
        expect(p.prompt.position.x).toBeGreaterThanOrEqual(0.15);
        expect(p.prompt.position.x).toBeLessThanOrEqual(0.85);
        expect(p.prompt.position.y).toBeGreaterThanOrEqual(0.15);
        expect(p.prompt.position.y).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it('tap prompts have valid shapes', () => {
    const validShapes: PromptShape[] = ['circle', 'square', 'triangle'];
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        for (const p of round.prompts) {
          if (p.prompt.type === 'tap') {
            expect(validShapes).toContain(p.prompt.shape);
          }
        }
      }
    }
  });

  it('all colors are valid PromptColor values', () => {
    const validColors: PromptColor[] = ['red', 'blue', 'green', 'yellow'];
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        for (const p of round.prompts) {
          expect(validColors).toContain(p.prompt.color);
        }
      }
    }
  });

  it('prompt hash matches recomputation (commitment scheme)', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      for (const p of round.prompts) {
        const { promptHash: _hash, ...configWithoutHash } = p;
        const recomputed = generatePromptHash(configWithoutHash);
        expect(p.promptHash).toBe(recomputed);
      }
    }
  });

  it('round hash is SHA-256 of concatenated prompt hashes', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      const concatenated = round.prompts.map((p) => p.promptHash).join('');
      const expected = sha256(concatenated);
      expect(round.roundHash).toBe(expected);
    }
  });

  it('round numbers are sequential 1..3', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (let i = 0; i < 3; i++) {
      expect(rounds[i]!.roundNumber).toBe(i + 1);
    }
  });

  it('prompt numbers are sequential 1..8 within each round', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      for (let i = 0; i < 8; i++) {
        expect(round.prompts[i]!.promptNumber).toBe(i + 1);
      }
    }
  });

  it('prompt size varies by wager amount', () => {
    const low = generateMatchRounds(SEED_A, 0.5);
    const high = generateMatchRounds(SEED_A, 25);
    expect(low[0]!.prompts[0]!.prompt.size).toBe(0.12);
    expect(high[0]!.prompts[0]!.prompt.size).toBe(0.06);
  });

  // ─── Swipe-specific tests ──────────────────────────────────────────

  it('each round has 2-4 swipe prompts', () => {
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e', 'seed-f', 'seed-g']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        const swipeCount = round.prompts.filter(p => p.prompt.type === 'swipe').length;
        expect(swipeCount).toBeGreaterThanOrEqual(QUICK_DRAW_CONSTANTS.MIN_SWIPES_PER_ROUND);
        expect(swipeCount).toBeLessThanOrEqual(QUICK_DRAW_CONSTANTS.MAX_SWIPES_PER_ROUND);
      }
    }
  });

  it('first prompt is never a swipe', () => {
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e', 'seed-f', 'seed-g']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        expect(round.prompts[0]!.prompt.type).toBe('tap');
      }
    }
  });

  it('no two consecutive swipe prompts', () => {
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e', 'seed-f', 'seed-g']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        for (let i = 1; i < round.prompts.length; i++) {
          if (round.prompts[i]!.prompt.type === 'swipe') {
            expect(round.prompts[i - 1]!.prompt.type).not.toBe('swipe');
          }
        }
      }
    }
  });

  it('swipe prompts have valid direction', () => {
    const validDirections: SwipeDirection[] = ['up', 'down', 'left', 'right'];
    for (const seed of [SEED_A, SEED_B, 'seed-c', 'seed-d', 'seed-e']) {
      const rounds = generateMatchRounds(seed, 1);
      for (const round of rounds) {
        for (const p of round.prompts) {
          if (p.prompt.type === 'swipe') {
            expect(p.prompt.swipeDirection).toBeDefined();
            expect(validDirections).toContain(p.prompt.swipeDirection);
          }
        }
      }
    }
  });

  it('all prompts have a valid type', () => {
    const rounds = generateMatchRounds(SEED_A, 1);
    for (const round of rounds) {
      for (const p of round.prompts) {
        expect(['tap', 'swipe']).toContain(p.prompt.type);
      }
    }
  });
});
