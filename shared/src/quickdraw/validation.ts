import type { PlayerId, Timestamp } from '../types/common.js';
import type { Prompt, PromptResult, RoundResult } from '../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../types/quickdraw.js';

export interface TapEvent {
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly timestamp: Timestamp;
  readonly isTrusted: boolean;
}

const HITBOX_FORGIVENESS = 1.2;

export function isReactionTimeValid(reactionMs: number): { valid: boolean; reason?: string } {
  if (reactionMs < QUICK_DRAW_CONSTANTS.REACTION_FLOOR_MS) {
    return { valid: false, reason: 'below_human_floor' };
  }
  if (reactionMs > QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS) {
    return { valid: false, reason: 'timeout' };
  }
  return { valid: true };
}

export function isTapOnTarget(tap: { x: number; y: number }, prompt: Prompt): boolean {
  const dx = tap.x - prompt.position.x;
  const dy = tap.y - prompt.position.y;
  const effectiveSize = prompt.size * HITBOX_FORGIVENESS;

  switch (prompt.shape) {
    case 'circle':
    case 'triangle':
      return Math.sqrt(dx * dx + dy * dy) <= effectiveSize;
    case 'square':
      return Math.abs(dx) <= effectiveSize && Math.abs(dy) <= effectiveSize;
  }
}

export function isFalseStart(tapTimestamp: Timestamp, promptTimestamp: Timestamp): boolean {
  return tapTimestamp < promptTimestamp;
}

/**
 * Score a round by aggregating 8 prompt results per player.
 * Lower total time wins.
 */
export function scoreRound(
  playerAResults: PromptResult[],
  playerBResults: PromptResult[],
  playerAId: PlayerId,
  playerBId: PlayerId,
  roundNumber: number,
): RoundResult {
  const playerATotalMs = computePlayerTotal(playerAResults);
  const playerBTotalMs = computePlayerTotal(playerBResults);

  let winnerId: PlayerId | null = null;
  if (playerATotalMs < playerBTotalMs) winnerId = playerAId;
  else if (playerBTotalMs < playerATotalMs) winnerId = playerBId;

  return {
    roundNumber,
    playerAResults,
    playerBResults,
    playerATotalMs,
    playerBTotalMs,
    winnerId,
  };
}

function computePlayerTotal(results: PromptResult[]): number {
  let total = 0;
  for (const r of results) {
    if (r.falseStart) {
      total += QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS;
    } else if (r.timedOut) {
      total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
    } else if (r.missed) {
      total += QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
    } else if (r.hit && r.reactionMs !== null) {
      total += r.reactionMs;
    } else {
      // No tap / invalid — treated as timeout
      total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
    }
  }
  return total;
}

export function determineMatchWinner(
  rounds: RoundResult[],
  playerAId: PlayerId,
  playerBId: PlayerId,
): { winnerId: PlayerId | null; score: [number, number] } {
  let aWins = 0;
  let bWins = 0;

  for (const round of rounds) {
    if (round.winnerId === playerAId) aWins++;
    else if (round.winnerId === playerBId) bWins++;
  }

  const score: [number, number] = [aWins, bWins];

  if (aWins >= QUICK_DRAW_CONSTANTS.ROUNDS_TO_WIN) return { winnerId: playerAId, score };
  if (bWins >= QUICK_DRAW_CONSTANTS.ROUNDS_TO_WIN) return { winnerId: playerBId, score };

  if (aWins > bWins) return { winnerId: playerAId, score };
  if (bWins > aWins) return { winnerId: playerBId, score };

  return { winnerId: null, score };
}
