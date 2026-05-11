import { describe, it, expect } from 'vitest';
import type { PlayerId } from '../../types/common.js';
import type { Prompt, PromptResult, RoundResult } from '../../types/quickdraw.js';
import { QUICK_DRAW_CONSTANTS } from '../../types/quickdraw.js';
import {
  isReactionTimeValid,
  isTapOnTarget,
  isFalseStart,
  scoreRound,
  determineMatchWinner,
} from '../validation.js';

const PLAYER_A = 'player-a' as PlayerId;
const PLAYER_B = 'player-b' as PlayerId;

function makeCirclePrompt(overrides?: Partial<Prompt>): Prompt {
  return {
    shape: 'circle',
    color: 'red',
    position: { x: 0.5, y: 0.5 },
    size: 0.1,
    ...overrides,
  };
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
    const result = isReactionTimeValid(119);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('below_human_floor');
  });

  it('120ms → valid', () => {
    expect(isReactionTimeValid(120).valid).toBe(true);
  });

  it('350ms → valid', () => {
    expect(isReactionTimeValid(350).valid).toBe(true);
  });

  it('2000ms → valid', () => {
    expect(isReactionTimeValid(2000).valid).toBe(true);
  });

  it('2001ms → invalid (timeout)', () => {
    const result = isReactionTimeValid(2001);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timeout');
  });
});

// ─── isTapOnTarget ──────────────────────────────────────────────────────────

describe('isTapOnTarget', () => {
  describe('circle', () => {
    const prompt = makeCirclePrompt(); // size=0.1, effective=0.12

    it('center hit', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('edge hit (at raw boundary)', () => {
      expect(isTapOnTarget({ x: 0.6, y: 0.5 }, prompt)).toBe(true);
    });

    it('hit within forgiveness margin (15% beyond raw edge)', () => {
      expect(isTapOnTarget({ x: 0.615, y: 0.5 }, prompt)).toBe(true);
    });

    it('miss beyond forgiveness margin (25% beyond raw edge)', () => {
      expect(isTapOnTarget({ x: 0.625, y: 0.5 }, prompt)).toBe(false);
    });

    it('wrong quadrant', () => {
      expect(isTapOnTarget({ x: 0.1, y: 0.1 }, prompt)).toBe(false);
    });
  });

  describe('square', () => {
    const prompt: Prompt = {
      shape: 'square', color: 'blue',
      position: { x: 0.5, y: 0.5 }, size: 0.1,
    };

    it('center hit', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('corner hit (at raw boundary)', () => {
      expect(isTapOnTarget({ x: 0.6, y: 0.6 }, prompt)).toBe(true);
    });

    it('hit within forgiveness margin', () => {
      expect(isTapOnTarget({ x: 0.615, y: 0.5 }, prompt)).toBe(true);
    });

    it('miss beyond forgiveness margin', () => {
      expect(isTapOnTarget({ x: 0.625, y: 0.5 }, prompt)).toBe(false);
    });
  });

  describe('triangle', () => {
    // Triangle at (0.5, 0.5), size=0.1.
    // Rendered vertices (from SVG "50,6.7 93.3,75 6.7,75"):
    //   Top:    (0.5, 0.5 - 0.0866)  = (0.5,   0.4134)
    //   BR:     (0.5 + 0.0866, 0.5 + 0.05) = (0.5866, 0.55)
    //   BL:     (0.5 - 0.0866, 0.5 + 0.05) = (0.4134, 0.55)
    // With 1.2× forgiveness, vertices scale outward by 1.2.
    const prompt: Prompt = {
      shape: 'triangle', color: 'green',
      position: { x: 0.5, y: 0.5 }, size: 0.1,
    };

    it('center hit', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('tap on top vertex → hit', () => {
      // Top vertex at (0.5, 0.4134). With forgiveness, extends to (0.5, 0.396)
      expect(isTapOnTarget({ x: 0.5, y: 0.414 }, prompt)).toBe(true);
    });

    it('tap on bottom-right vertex → hit', () => {
      // BR vertex at (0.5866, 0.55). With forgiveness, extends further.
      expect(isTapOnTarget({ x: 0.586, y: 0.55 }, prompt)).toBe(true);
    });

    it('tap on bottom-left vertex → hit', () => {
      expect(isTapOnTarget({ x: 0.414, y: 0.55 }, prompt)).toBe(true);
    });

    it('tap on midpoint of bottom edge → hit', () => {
      // Bottom edge midpoint: (0.5, 0.55)
      expect(isTapOnTarget({ x: 0.5, y: 0.55 }, prompt)).toBe(true);
    });

    it('tap on midpoint of left edge → hit', () => {
      // Left edge: from top (0.5, 0.4134) to BL (0.4134, 0.55)
      // Midpoint: (0.4567, 0.4817)
      expect(isTapOnTarget({ x: 0.457, y: 0.482 }, prompt)).toBe(true);
    });

    it('tap on midpoint of right edge → hit', () => {
      // Right edge: from top (0.5, 0.4134) to BR (0.5866, 0.55)
      // Midpoint: (0.5433, 0.4817)
      expect(isTapOnTarget({ x: 0.543, y: 0.482 }, prompt)).toBe(true);
    });

    it('tap just outside top vertex (beyond forgiveness) → miss', () => {
      // Top of forgiveness-scaled triangle: y = 0.5 - 0.0866*0.12 = 0.5 - 0.10392 ≈ 0.396
      expect(isTapOnTarget({ x: 0.5, y: 0.39 }, prompt)).toBe(false);
    });

    it('tap far outside → miss', () => {
      expect(isTapOnTarget({ x: 0.1, y: 0.1 }, prompt)).toBe(false);
    });

    it('tap to the right of BR vertex (beyond forgiveness) → miss', () => {
      // BR vertex with forgiveness: x = 0.5 + 0.0866*1.2*0.1 ... wait, more precisely:
      // effectiveSize = 0.1 * 1.2 = 0.12. BR.x = 0.5 + 0.866 * 0.12 = 0.5 + 0.10392 = 0.60392
      expect(isTapOnTarget({ x: 0.61, y: 0.55 }, prompt)).toBe(false);
    });
  });

  describe('edge tap bug report scenario', () => {
    it('tap visually on shape but at the edge registers as a hit', () => {
      const prompt = makeCirclePrompt();
      expect(isTapOnTarget({ x: 0.608, y: 0.5 }, prompt)).toBe(true);
    });
  });
});

// ─── isFalseStart ───────────────────────────────────────────────────────────

describe('isFalseStart', () => {
  it('tap 1ms before prompt → true', () => {
    expect(isFalseStart(999, 1000)).toBe(true);
  });

  it('tap at exact prompt time → false', () => {
    expect(isFalseStart(1000, 1000)).toBe(false);
  });

  it('tap 1ms after prompt → false', () => {
    expect(isFalseStart(1001, 1000)).toBe(false);
  });
});

// ─── scoreRound ─────────────────────────────────────────────────────────────

describe('scoreRound', () => {
  it('8 clean hits vs 7 hits + 1 miss → lower total wins', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_A));
    const bResults = [
      ...Array.from({ length: 7 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B)),
      makeMiss(8, PLAYER_B),
    ];

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
    expect(result.winnerId).toBe(PLAYER_B);
  });

  it('mixed results scored correctly', () => {
    const aResults: PromptResult[] = [
      makeCleanHit(1, 250, PLAYER_A),
      makeCleanHit(2, 300, PLAYER_A),
      makeMiss(3, PLAYER_A),          // +500
      makeCleanHit(4, 280, PLAYER_A),
      makeFalseStart(5, PLAYER_A),    // +1000
      makeCleanHit(6, 320, PLAYER_A),
      makeTimeout(7, PLAYER_A),        // +2000
      makeCleanHit(8, 290, PLAYER_A),
    ];
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 350, PLAYER_B));

    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);

    expect(result.playerATotalMs).toBe(4940);
    expect(result.playerBTotalMs).toBe(2800);
    expect(result.winnerId).toBe(PLAYER_B);
  });

  it('equal totals → draw (null winnerId)', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_A));
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B));

    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);

    expect(result.playerATotalMs).toBe(2400);
    expect(result.playerBTotalMs).toBe(2400);
    expect(result.winnerId).toBeNull();
  });

  it('timeout uses ceiling as time', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeTimeout(i + 1, PLAYER_A));
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 500, PLAYER_B));

    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);

    expect(result.playerATotalMs).toBe(8 * QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS);
    expect(result.playerBTotalMs).toBe(4000);
    expect(result.winnerId).toBe(PLAYER_B);
  });

  it('hit with 2 misses → reactionMs + 2 × MISS_PENALTY_MS', () => {
    const aResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_A, i === 0 ? 2 : 0));
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B));

    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);

    // A: 300 + 2*500 + 7*300 = 300 + 1000 + 2100 = 3400
    expect(result.playerATotalMs).toBe(3400);
    expect(result.playerBTotalMs).toBe(2400);
    expect(result.winnerId).toBe(PLAYER_B);
  });

  it('timeout with misses → ceiling + missCount × MISS_PENALTY_MS', () => {
    const aResults: PromptResult[] = [
      makeTimeout(1, PLAYER_A, 3), // 2000 + 3*500 = 3500
      ...Array.from({ length: 7 }, (_, i) => makeCleanHit(i + 2, 300, PLAYER_A)),
    ];
    const bResults = Array.from({ length: 8 }, (_, i) => makeCleanHit(i + 1, 300, PLAYER_B));

    const result = scoreRound(aResults, bResults, PLAYER_A, PLAYER_B, 1);

    expect(result.playerATotalMs).toBe(3500 + 2100);
    expect(result.playerBTotalMs).toBe(2400);
  });
});

// ─── determineMatchWinner ───────────────────────────────────────────────────

describe('determineMatchWinner', () => {
  function roundResult(winnerId: PlayerId | null, roundNumber: number): RoundResult {
    return {
      roundNumber,
      winnerId,
      playerAResults: [],
      playerBResults: [],
      playerATotalMs: winnerId === PLAYER_A ? 2000 : 3000,
      playerBTotalMs: winnerId === PLAYER_B ? 2000 : 3000,
    };
  }

  it('2-0 → winner is player with 2 wins', () => {
    const rounds = [roundResult(PLAYER_A, 1), roundResult(PLAYER_A, 2)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.score).toEqual([2, 0]);
  });

  it('2-1 → winner is player with 2 wins', () => {
    const rounds = [roundResult(PLAYER_A, 1), roundResult(PLAYER_B, 2), roundResult(PLAYER_A, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.score).toEqual([2, 1]);
  });

  it('1-1 + draw → null (tie match)', () => {
    const rounds = [roundResult(PLAYER_A, 1), roundResult(PLAYER_B, 2), roundResult(null, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBeNull();
    expect(result.score).toEqual([1, 1]);
  });

  it('B wins 2-0', () => {
    const rounds = [roundResult(PLAYER_B, 1), roundResult(PLAYER_B, 2)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.score).toEqual([0, 2]);
  });

  it('B wins 2-1', () => {
    const rounds = [roundResult(PLAYER_A, 1), roundResult(PLAYER_B, 2), roundResult(PLAYER_B, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.score).toEqual([1, 2]);
  });

  it('all 3 draws → null', () => {
    const rounds = [roundResult(null, 1), roundResult(null, 2), roundResult(null, 3)];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBeNull();
    expect(result.score).toEqual([0, 0]);
  });
});
