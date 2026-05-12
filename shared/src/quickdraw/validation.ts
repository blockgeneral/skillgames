import type { PlayerId, Timestamp } from '../types/common.js';
import type { Prompt, PromptResult, RoundResult, SwipeDirection } from '../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../types/quickdraw.js';

export interface TapEvent {
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly timestamp: Timestamp;
  readonly isTrusted: boolean;
}

const HITBOX_FORGIVENESS = 1.2;

// Triangle vertex offsets relative to center, normalized to size=1.
const TRI_TOP_Y = (50 - 6.7) / 50;     // 0.866
const TRI_BOT_X = (93.3 - 50) / 50;    // 0.866
const TRI_BOT_Y = (75 - 50) / 50;      // 0.5

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
  // Tapping a swipe prompt is always a miss
  if (prompt.type === 'swipe') return false;

  const dx = tap.x - prompt.position.x;
  const dy = tap.y - prompt.position.y;
  const effectiveSize = prompt.size * HITBOX_FORGIVENESS;

  switch (prompt.shape) {
    case 'circle':
      return Math.sqrt(dx * dx + dy * dy) <= effectiveSize;
    case 'square':
      return Math.abs(dx) <= effectiveSize && Math.abs(dy) <= effectiveSize;
    case 'triangle': {
      const ax = 0;
      const ay = -TRI_TOP_Y * effectiveSize;
      const bx = TRI_BOT_X * effectiveSize;
      const by = TRI_BOT_Y * effectiveSize;
      const cx = -TRI_BOT_X * effectiveSize;
      const cy = TRI_BOT_Y * effectiveSize;
      return pointInTriangle(dx, dy, ax, ay, bx, by, cx, cy);
    }
  }
}

export function isSwipeValid(
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
  expectedDirection: SwipeDirection,
  minDistancePx: number,
): { valid: boolean; reason?: string } {
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < minDistancePx) {
    return { valid: false, reason: 'too_short' };
  }

  let actualDirection: SwipeDirection;
  if (Math.abs(dx) > Math.abs(dy)) {
    actualDirection = dx > 0 ? 'right' : 'left';
  } else {
    actualDirection = dy > 0 ? 'down' : 'up';
  }

  if (actualDirection !== expectedDirection) {
    return { valid: false, reason: 'wrong_direction' };
  }

  return { valid: true };
}

function crossSign(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

function pointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): boolean {
  const d1 = crossSign(px, py, ax, ay, bx, by);
  const d2 = crossSign(px, py, bx, by, cx, cy);
  const d3 = crossSign(px, py, cx, cy, ax, ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

export function isFalseStart(tapTimestamp: Timestamp, promptTimestamp: Timestamp): boolean {
  return tapTimestamp < promptTimestamp;
}

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

  return { roundNumber, playerAResults, playerBResults, playerATotalMs, playerBTotalMs, winnerId };
}

function computePlayerTotal(results: PromptResult[]): number {
  let total = 0;
  for (const r of results) {
    const missPenalty = r.missCount * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
    if (r.falseStart) {
      total += QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS;
    } else if (r.timedOut) {
      total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS + missPenalty;
    } else if (r.missed) {
      total += QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
    } else if (r.hit && r.reactionMs !== null) {
      total += r.reactionMs + missPenalty;
    } else {
      total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
    }
  }
  return total;
}

export function determineMatchWinner(
  rounds: RoundResult[],
  playerAId: PlayerId,
  playerBId: PlayerId,
): { winnerId: PlayerId | null; playerATotalMs: number; playerBTotalMs: number } {
  let aTotalMs = 0;
  let bTotalMs = 0;

  for (const round of rounds) {
    aTotalMs += round.playerATotalMs;
    bTotalMs += round.playerBTotalMs;
  }

  let winnerId: PlayerId | null = null;
  if (aTotalMs < bTotalMs) winnerId = playerAId;
  else if (bTotalMs < aTotalMs) winnerId = playerBId;

  return { winnerId, playerATotalMs: aTotalMs, playerBTotalMs: bTotalMs };
}
