import { describe, it, expect } from 'vitest';
import type { PlayerId } from '../../types/common.js';
import type { Prompt, PromptResult, RoundResult } from '../../types/quickdraw.js';
import {
  isReactionTimeValid,
  isTapOnTarget,
  isSwipeValid,
  isFalseStart,
  scoreRound,
  determineMatchWinner,
} from '../validation.js';

const PLAYER_A = 'player-a' as PlayerId;
const PLAYER_B = 'player-b' as PlayerId;

function makeTapPrompt(overrides?: Partial<Prompt>): Prompt {
  return { type: 'tap', shape: 'circle', color: 'red', position: { x: 0.5, y: 0.5 }, size: 0.1, ...overrides };
}

function makeSwipePrompt(overrides?: Partial<Prompt>): Prompt {
  return { type: 'swipe', shape: 'circle', color: 'blue', position: { x: 0.5, y: 0.5 }, size: 0.1, swipeDirection: 'right', ...overrides };
}

function makeCleanHit(promptNumber: number, reactionMs: number, playerId: PlayerId, missCount = 0): PromptResult {
  return { promptNumber, playerId, reactionMs, hit: true, falseStart: false, missed: false, timedOut: false, missCount };
}

function makeMiss(promptNumber: number, playerId: PlayerId): PromptResult {
  return { promptNumber, playerId, reactionMs: null, hit: false, falseStart: false, missed: true, timedOut: false, missCount: 0 };
}

function makeFalseStart(promptNumber: number, playerId: PlayerId): PromptResult {
  return { promptNumber, playerId, reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false, missCount: 0 };
}

function makeTimeout(promptNumber: number, playerId: PlayerId, missCount = 0): PromptResult {
  return { promptNumber, playerId, reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true, missCount };
}

// ─── isReactionTimeValid ────────────────────────────────────────────────────

describe('isReactionTimeValid', () => {
  it('119ms → invalid (below floor)', () => {
    expect(isReactionTimeValid(119)).toEqual({ valid: false, reason: 'below_human_floor' });
  });
  it('120ms → valid', () => { expect(isReactionTimeValid(120).valid).toBe(true); });
  it('350ms → valid', () => { expect(isReactionTimeValid(350).valid).toBe(true); });
  it('2000ms → valid', () => { expect(isReactionTimeValid(2000).valid).toBe(true); });
  it('2001ms → invalid (timeout)', () => {
    expect(isReactionTimeValid(2001)).toEqual({ valid: false, reason: 'timeout' });
  });
});

// ─── isTapOnTarget ──────────────────────────────────────────────────────────

describe('isTapOnTarget', () => {
  describe('circle', () => {
    const prompt = makeTapPrompt();
    it('center hit', () => { expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true); });
    it('edge hit', () => { expect(isTapOnTarget({ x: 0.6, y: 0.5 }, prompt)).toBe(true); });
    it('forgiveness hit', () => { expect(isTapOnTarget({ x: 0.615, y: 0.5 }, prompt)).toBe(true); });
    it('miss beyond forgiveness', () => { expect(isTapOnTarget({ x: 0.625, y: 0.5 }, prompt)).toBe(false); });
  });

  describe('square', () => {
    const prompt = makeTapPrompt({ shape: 'square', color: 'blue' });
    it('center hit', () => { expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true); });
    it('corner hit', () => { expect(isTapOnTarget({ x: 0.6, y: 0.6 }, prompt)).toBe(true); });
    it('forgiveness hit', () => { expect(isTapOnTarget({ x: 0.615, y: 0.5 }, prompt)).toBe(true); });
    it('miss beyond forgiveness', () => { expect(isTapOnTarget({ x: 0.625, y: 0.5 }, prompt)).toBe(false); });
  });

  describe('triangle', () => {
    const prompt = makeTapPrompt({ shape: 'triangle', color: 'green' });
    it('center hit', () => { expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true); });
    it('top vertex hit', () => { expect(isTapOnTarget({ x: 0.5, y: 0.414 }, prompt)).toBe(true); });
    it('bottom-right vertex hit', () => { expect(isTapOnTarget({ x: 0.586, y: 0.55 }, prompt)).toBe(true); });
    it('bottom-left vertex hit', () => { expect(isTapOnTarget({ x: 0.414, y: 0.55 }, prompt)).toBe(true); });
    it('bottom edge midpoint hit', () => { expect(isTapOnTarget({ x: 0.5, y: 0.55 }, prompt)).toBe(true); });
    it('outside top → miss', () => { expect(isTapOnTarget({ x: 0.5, y: 0.39 }, prompt)).toBe(false); });
    it('far outside → miss', () => { expect(isTapOnTarget({ x: 0.1, y: 0.1 }, prompt)).toBe(false); });
  });

  describe('tap on swipe prompt', () => {
    it('always misses regardless of position', () => {
      const prompt = makeSwipePrompt();
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(false);
    });
  });
});

// ─── isSwipeValid ───────────────────────────────────────────────────────────

describe('isSwipeValid', () => {
  it('correct direction right → valid', () => {
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 100, y: 0 }, 'right', 40);
    expect(result.valid).toBe(true);
  });

  it('correct direction up → valid', () => {
    const result = isSwipeValid({ x: 0, y: 100 }, { x: 0, y: 0 }, 'up', 40);
    expect(result.valid).toBe(true);
  });

  it('correct direction left → valid', () => {
    const result = isSwipeValid({ x: 100, y: 0 }, { x: 0, y: 0 }, 'left', 40);
    expect(result.valid).toBe(true);
  });

  it('correct direction down → valid', () => {
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 0, y: 100 }, 'down', 40);
    expect(result.valid).toBe(true);
  });

  it('wrong direction → invalid', () => {
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 100, y: 0 }, 'left', 40);
    expect(result).toEqual({ valid: false, reason: 'wrong_direction' });
  });

  it('too short distance → invalid', () => {
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 20, y: 0 }, 'right', 40);
    expect(result).toEqual({ valid: false, reason: 'too_short' });
  });

  it('diagonal resolves to dominant axis', () => {
    // dx=80, dy=30 → horizontal → right
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 80, y: 30 }, 'right', 40);
    expect(result.valid).toBe(true);
  });

  it('exactly at min distance → valid', () => {
    const result = isSwipeValid({ x: 0, y: 0 }, { x: 40, y: 0 }, 'right', 40);
    expect(result.valid).toBe(true);
  });
});

// ─── isFalseStart ───────────────────────────────────────────────────────────

describe('isFalseStart', () => {
  it('tap before prompt → true', () => { expect(isFalseStart(999, 1000)).toBe(true); });
  it('tap at prompt → false', () => { expect(isFalseStart(1000, 1000)).toBe(false); });
  it('tap after prompt → false', () => { expect(isFalseStart(1001, 1000)).toBe(false); });
});

// ─── scoreRound ─────────────────────────────────────────────────────────────

describe('scoreRound', () => {
  it('8 clean hits vs 7 hits + 1 miss → lower total wins', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_A));
    const bResults = [...Array.from({ length: 7 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B)), makeMiss(8, PLAYER_B)];
    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);
    expect(result.playerATotalMs).toBe(2400);
    expect(result.playerBTotalMs).toBe(2600);
    expect(result.winnerId).toBe(PLAYER_A);
  });

  it('all false starts → huge penalty', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeFalseStart(i + 1, PLAYER_A));
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 400, PLAYER_B));
    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);
    expect(result.playerATotalMs).toBe(8000);
    expect(result.playerBTotalMs).toBe(3200);
  });

  it('hit with 2 misses adds penalty', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_A, i === 0 ? 2 : 0));
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B));
    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);
    expect(result.playerATotalMs).toBe(3400); // 300+1000 + 7*300
  });

  it('timeout with misses adds penalty', () => {
    const aResults: PromptResult[] = [
      makeTimeout(1, PLAYER_A, 3),
      ...Array.from({ length: 7 }, (_, i) => makeCleanHit(i + 2, 300, PLAYER_A)),
    ];
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B));
    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);
    expect(result.playerATotalMs).toBe(3500 + 2100);
  });
});

// ─── determineMatchWinner ───────────────────────────────────────────────────

describe('determineMatchWinner', () => {
  function roundResult(aTotalMs: number, bTotalMs: number, roundNumber: number): RoundResult {
    return {
      roundNumber,
      winnerId: aTotalMs < bTotalMs ? PLAYER_A : bTotalMs < aTotalMs ? PLAYER_B : null,
      playerAResults: [], playerBResults: [],
      playerATotalMs: aTotalMs, playerBTotalMs: bTotalMs,
    };
  }

  it('lower cumulative total wins', () => {
    const rounds = [roundResult(2400, 2800, 1), roundResult(2600, 2500, 2), roundResult(2300, 2700, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.playerATotalMs).toBe(7300);
  });

  it('B wins despite A winning 2 rounds', () => {
    const rounds = [roundResult(2400, 2500, 1), roundResult(2400, 2500, 2), roundResult(4000, 2000, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_B);
  });

  it('equal totals → draw', () => {
    const rounds = [roundResult(2400, 2800, 1), roundResult(2800, 2400, 2), roundResult(2500, 2500, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBeNull();
  });
});
