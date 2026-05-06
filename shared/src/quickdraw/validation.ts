import type { PlayerId, Timestamp } from '../types/common.js';
import type { Prompt, RoundResult } from '../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../types/quickdraw.js';

export interface TapEvent {
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly timestamp: Timestamp;
  readonly isTrusted: boolean;
}

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

  switch (prompt.shape) {
    case 'circle':
    case 'triangle':
      // Both use bounding circle (circumradius for triangle)
      return Math.sqrt(dx * dx + dy * dy) <= prompt.size;
    case 'square':
      return Math.abs(dx) <= prompt.size && Math.abs(dy) <= prompt.size;
  }
}

export function isFalseStart(tapTimestamp: Timestamp, promptTimestamp: Timestamp): boolean {
  return tapTimestamp < promptTimestamp;
}

export function determineRoundWinner(
  playerATap: TapEvent | null,
  playerBTap: TapEvent | null,
  prompt: Prompt,
  promptTimestamp: Timestamp,
  roundNumber: number,
): RoundResult {
  const aResult = evaluateTap(playerATap, prompt, promptTimestamp);
  const bResult = evaluateTap(playerBTap, prompt, promptTimestamp);

  // Both false starts → draw
  if (aResult.falseStart && bResult.falseStart) {
    return {
      roundNumber,
      winnerId: null,
      playerAReactionMs: null,
      playerBReactionMs: null,
      falseStart: null,
      draw: true,
    };
  }

  // One false start → other player wins
  if (aResult.falseStart) {
    return {
      roundNumber,
      winnerId: playerBTap?.playerId ?? null,
      playerAReactionMs: null,
      playerBReactionMs: bResult.reactionMs,
      falseStart: playerATap!.playerId,
      draw: false,
    };
  }
  if (bResult.falseStart) {
    return {
      roundNumber,
      winnerId: playerATap?.playerId ?? null,
      playerAReactionMs: aResult.reactionMs,
      playerBReactionMs: null,
      falseStart: playerBTap!.playerId,
      draw: false,
    };
  }

  // Compare valid taps
  const aValid = aResult.validReactionMs;
  const bValid = bResult.validReactionMs;

  if (aValid !== null && bValid !== null) {
    const diff = Math.abs(aValid - bValid);
    if (diff <= 1) {
      return {
        roundNumber,
        winnerId: null,
        playerAReactionMs: aValid,
        playerBReactionMs: bValid,
        falseStart: null,
        draw: true,
      };
    }
    const winnerId = aValid < bValid ? playerATap!.playerId : playerBTap!.playerId;
    return {
      roundNumber,
      winnerId,
      playerAReactionMs: aValid,
      playerBReactionMs: bValid,
      falseStart: null,
      draw: false,
    };
  }

  if (aValid !== null) {
    return {
      roundNumber,
      winnerId: playerATap!.playerId,
      playerAReactionMs: aValid,
      playerBReactionMs: bResult.reactionMs,
      falseStart: null,
      draw: false,
    };
  }

  if (bValid !== null) {
    return {
      roundNumber,
      winnerId: playerBTap!.playerId,
      playerAReactionMs: aResult.reactionMs,
      playerBReactionMs: bValid,
      falseStart: null,
      draw: false,
    };
  }

  // Neither has a valid tap → draw
  return {
    roundNumber,
    winnerId: null,
    playerAReactionMs: aResult.reactionMs,
    playerBReactionMs: bResult.reactionMs,
    falseStart: null,
    draw: true,
  };
}

interface TapEvaluation {
  falseStart: boolean;
  /** Raw reaction time if tap existed and wasn't a false start, else null */
  reactionMs: number | null;
  /** Reaction time only if fully valid (on-target, in-range, trusted), else null */
  validReactionMs: number | null;
}

function evaluateTap(
  tap: TapEvent | null,
  prompt: Prompt,
  promptTimestamp: Timestamp,
): TapEvaluation {
  if (tap === null) {
    return { falseStart: false, reactionMs: null, validReactionMs: null };
  }

  if (!tap.isTrusted) {
    return { falseStart: false, reactionMs: null, validReactionMs: null };
  }

  if (isFalseStart(tap.timestamp, promptTimestamp)) {
    return { falseStart: true, reactionMs: null, validReactionMs: null };
  }

  const reactionMs = tap.timestamp - promptTimestamp;

  if (!isTapOnTarget(tap, prompt)) {
    return { falseStart: false, reactionMs, validReactionMs: null };
  }

  const validation = isReactionTimeValid(reactionMs);
  if (!validation.valid) {
    return { falseStart: false, reactionMs, validReactionMs: null };
  }

  return { falseStart: false, reactionMs, validReactionMs: reactionMs };
}

export function determineMatchWinner(
  rounds: RoundResult[],
  playerAId: PlayerId,
  playerBId: PlayerId,
): { winnerId: PlayerId | null; score: [number, number] } {
  let aWins = 0;
  let bWins = 0;

  for (const round of rounds) {
    if (round.draw) continue;
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
