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
 * Returns 3 rounds, each with 8 prompts (mix of tap and swipe).
 */
export function generateMatchRounds(seed: string, wagerAmount: WagerAmount): RoundConfig[] {
  const next = createPrng(seed);
  const size = getPromptSize(wagerAmount);
  const rounds: RoundConfig[] = [];

  for (let r = 0; r < QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH; r++) {
    // Decide swipe positions for this round (2-4 swipes, never position 0, no consecutive)
    const swipeCount = QUICK_DRAW_CONSTANTS.MIN_SWIPES_PER_ROUND +
      Math.floor(next() * (QUICK_DRAW_CONSTANTS.MAX_SWIPES_PER_ROUND - QUICK_DRAW_CONSTANTS.MIN_SWIPES_PER_ROUND + 1));
    const swipePositions = pickSwipePositions(next, swipeCount);

    const prompts: PromptConfig[] = [];

    for (let p = 0; p < QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND; p++) {
      const delay = Math.round(
        p === 0
          ? randomInRange(next, QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MIN_DELAY_MS, QUICK_DRAW_CONSTANTS.FIRST_PROMPT_MAX_DELAY_MS)
          : randomInRange(next, QUICK_DRAW_CONSTANTS.INTER_PROMPT_MIN_DELAY_MS, QUICK_DRAW_CONSTANTS.INTER_PROMPT_MAX_DELAY_MS),
      );

      const isSwipe = swipePositions.has(p);

      let shape = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_SHAPES);
      let color = randomPick(next, QUICK_DRAW_CONSTANTS.PROMPT_COLORS);
      let x = roundTo4(randomInRange(next, 0.15, 0.85));
      let y = roundTo4(randomInRange(next, 0.15, 0.85));
      const direction = randomPick(next, QUICK_DRAW_CONSTANTS.SWIPE_DIRECTIONS);

      // No-consecutive-duplicate check for adjacent tap prompts
      if (p > 0 && !isSwipe) {
        const prev = prompts[p - 1]!.prompt;
        if (prev.type === 'tap') {
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
      }

      const prompt: Prompt = isSwipe
        ? { type: 'swipe', shape: 'circle', color, position: { x, y }, size, swipeDirection: direction }
        : { type: 'tap', shape, color, position: { x, y }, size };

      const configWithoutHash = { promptNumber: p + 1, delay, prompt };
      const promptHash = generatePromptHash(configWithoutHash);

      prompts.push({ ...configWithoutHash, promptHash });
    }

    const roundHash = sha256(prompts.map((pc) => pc.promptHash).join(''));

    rounds.push({ roundNumber: r + 1, prompts, roundHash });
  }

  return rounds;
}

/**
 * Pick non-consecutive swipe positions from indices 1-7 (never 0).
 */
function pickSwipePositions(next: () => number, count: number): Set<number> {
  const positions = new Set<number>();
  for (let attempt = 0; attempt < 100 && positions.size < count; attempt++) {
    const pos = 1 + Math.floor(next() * 7); // 1-7
    if (!positions.has(pos) && !positions.has(pos - 1) && !positions.has(pos + 1)) {
      positions.add(pos);
    }
  }
  return positions;
}

export function generatePromptHash(config: Omit<PromptConfig, 'promptHash'>): string {
  return sha256(JSON.stringify(config));
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function getQuadrant(x: number, y: number): number {
  return (x >= 0.5 ? 1 : 0) + (y >= 0.5 ? 2 : 0);
}
