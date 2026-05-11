import type { WagerAmount } from '../types/common.js';
import type { Prompt, PromptConfig, RoundConfig } from '../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../types/quickdraw.js';
import { createPrng, randomInRange, randomPick } from './prng.js';
import { getPromptSize } from './difficulty.js';
import { sha256 } from './sha256.js';

const MAX_REROLLS = 10;

/**
 * Deterministically generate all round configs for a match.
 * Same seed + wagerAmount always produces identical output.
 * Returns 3 rounds, each with 8 prompts.
 */
export function generateMatchRounds(seed: string, wagerAmount: WagerAmount): RoundConfig[] {
  const next = createPrng(seed);
  const size = getPromptSize(wagerAmount);
  const rounds: RoundConfig[] = [];

  for (let r = 0; r < QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH; r++) {
    const prompts: PromptConfig[] = [];

    for (let p = 0; p < QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND; p++) {
      const delay = Math.round(
        p === 0
          ? randomInRange(next, QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MIN_DELAY_MS, QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MAX_DELAY_MS)
          : randomInRange(next, QUICK_DRAW_CONSTANTS.INTER_PROMPT_MIN_DELAY_MS, QUICK_DRAW_CONSTANTS.INTER_PROMPT_MAX_DELAY_MS),
      );

      let shape = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_SHAPES);
      let color = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_COLORS);
      let x = roundTo4(randomInRange(next, 0.15, 0.85));
      let y = roundTo4(randomInRange(next, 0.15, 0.85));

      // Ensure no two consecutive prompts share shape+color+quadrant
      if (p > 0) {
        const prev = prompts[p - 1]!.prompt;
        let rerolls = 0;
        while (
          rerolls < MAX_REROLLS &&
          shape === prev.shape &&
          color === prev.color &&
          getQuadrant(x, y) === getQuadrant(prev.position.x, prev.position.y)
        ) {
          shape = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_SHAPES);
          color = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_COLORS);
          x = roundTo4(randomInRange(next, 0.15, 0.85));
          y = roundTo4(randomInRange(next, 0.15, 0.85));
          rerolls++;
        }
      }

      const prompt: Prompt = { shape, color, position: { x, y }, size };
      const configWithoutHash = { promptNumber: p + 1, delay, prompt };
      const promptHash = generatePromptHash(configWithoutHash);

      prompts.push({ ...configWithoutHash, promptHash });
    }

    const roundHash = sha256(prompts.map((pc) => pc.promptHash).join(''));

    rounds.push({
      roundNumber: r + 1,
      prompts,
      roundHash,
    });
  }

  return rounds;
}

/**
 * Compute the SHA-256 commitment hash for a prompt config.
 * Used by the server to commit to prompts before revealing them.
 */
export function generatePromptHash(config: Omit<PromptConfig, 'promptHash'>): string {
  return sha256(JSON.stringify(config));
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function getQuadrant(x: number, y: number): number {
  return (x >= 0.5 ? 1 : 0) + (y >= 0.5 ? 2 : 0);
}
