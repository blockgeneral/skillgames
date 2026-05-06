import type { WagerAmount } from '../types/common.js';

const PROMPT_SIZE_BY_WAGER: Record<WagerAmount, number> = {
  0.5: 0.12,
  1: 0.11,
  2: 0.10,
  5: 0.09,
  10: 0.07,
  25: 0.06,
};

/** Get the normalized prompt size (radius) for a given wager amount. */
export function getPromptSize(wagerAmount: WagerAmount): number {
  return PROMPT_SIZE_BY_WAGER[wagerAmount];
}
