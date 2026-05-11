import type { PromptResult } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';

export function computeRunningTotal(results: PromptResult[]): number {
  let total = 0;
  for (const r of results) {
    if (r.falseStart) total += QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS;
    else if (r.timedOut) total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
    else if (r.missed) total += QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
    else if (r.hit && r.reactionMs !== null) total += r.reactionMs;
    else total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
  }
  return total;
}
