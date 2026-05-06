import type { WagerAmount } from '../types/common.js';
import type { Prompt, RoundConfig } from '../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../types/quickdraw.js';
import { createPrng, randomInRange, randomPick } from './prng.js';
import { getPromptSize } from './difficulty.js';
import { sha256 } from './sha256.js';

/**
 * Deterministically generate all round configs for a match.
 * Same seed + wagerAmount always produces identical output.
 */
export function generateMatchRounds(seed: string, wagerAmount: WagerAmount): RoundConfig[] {
  const next = createPrng(seed);
  const size = getPromptSize(wagerAmount);
  const rounds: RoundConfig[] = [];

  for (let i = 0; i < QUICK_DRAW_CONSTANTS.TOTAL_ROUNDS; i++) {
    const delay = Math.round(
      randomInRange(next, QUICK_DRAW_CONSTANTS.MIN_DELAY_MS, QUICK_DRAW_CONSTANTS.MAX_DELAY_MS),
    );
    const shape = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_SHAPES);
    const color = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_COLORS);
    const x = roundTo4(randomInRange(next, 0.15, 0.85));
    const y = roundTo4(randomInRange(next, 0.15, 0.85));

    const prompt: Prompt = { shape, color, position: { x, y }, size };

    const configWithoutHash = { roundNumber: i + 1, delay, prompt };
    const promptHash = generatePromptHash(configWithoutHash);

    rounds.push({ ...configWithoutHash, promptHash });
  }

  return rounds;
}

/**
 * Compute the SHA-256 commitment hash for a round config.
 * Used by the server to commit to prompts before revealing them.
 */
export function generatePromptHash(config: Omit<RoundConfig, 'promptHash'>): string {
  return sha256(JSON.stringify(config));
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
