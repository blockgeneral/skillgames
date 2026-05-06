import { describe, it, expect } from 'vitest';
import type { PlayerId } from '../../types/common.js';
import type { Prompt, RoundResult } from '../../types/quickdraw.js';
import {
  isReactionTimeValid,
  isTapOnTarget,
  isFalseStart,
  determineRoundWinner,
  determineMatchWinner,
  type TapEvent,
} from '../validation.js';

const PLAYER_A = 'player-a' as PlayerId;
const PLAYER_B = 'player-b' as PlayerId;

function makeTap(overrides: Partial<TapEvent> & { playerId: PlayerId }): TapEvent {
  return {
    x: 0.5,
    y: 0.5,
    timestamp: 1000,
    isTrusted: true,
    ...overrides,
  };
}

function makeCirclePrompt(overrides?: Partial<Prompt>): Prompt {
  return {
    shape: 'circle',
    color: 'red',
    position: { x: 0.5, y: 0.5 },
    size: 0.1,
    ...overrides,
  };
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
    const prompt = makeCirclePrompt();

    it('center hit', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('edge hit (exactly on boundary)', () => {
      expect(isTapOnTarget({ x: 0.6, y: 0.5 }, prompt)).toBe(true);
    });

    it('near miss (just outside)', () => {
      expect(isTapOnTarget({ x: 0.61, y: 0.5 }, prompt)).toBe(false);
    });

    it('wrong quadrant', () => {
      expect(isTapOnTarget({ x: 0.1, y: 0.1 }, prompt)).toBe(false);
    });
  });

  describe('square', () => {
    const prompt: Prompt = {
      shape: 'square',
      color: 'blue',
      position: { x: 0.5, y: 0.5 },
      size: 0.1,
    };

    it('center hit', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('corner hit (on boundary)', () => {
      expect(isTapOnTarget({ x: 0.6, y: 0.6 }, prompt)).toBe(true);
    });

    it('edge hit', () => {
      expect(isTapOnTarget({ x: 0.6, y: 0.5 }, prompt)).toBe(true);
    });

    it('just outside', () => {
      expect(isTapOnTarget({ x: 0.61, y: 0.5 }, prompt)).toBe(false);
    });
  });

  describe('triangle', () => {
    const prompt: Prompt = {
      shape: 'triangle',
      color: 'green',
      position: { x: 0.5, y: 0.5 },
      size: 0.1,
    };

    it('center hit (within bounding circle)', () => {
      expect(isTapOnTarget({ x: 0.5, y: 0.5 }, prompt)).toBe(true);
    });

    it('within bounding circle', () => {
      expect(isTapOnTarget({ x: 0.59, y: 0.5 }, prompt)).toBe(true);
    });

    it('just outside bounding circle', () => {
      expect(isTapOnTarget({ x: 0.61, y: 0.5 }, prompt)).toBe(false);
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

// ─── determineRoundWinner ───────────────────────────────────────────────────

describe('determineRoundWinner', () => {
  const prompt = makeCirclePrompt();
  const promptTs = 1000;

  it('A faster → A wins', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1200, x: 0.5, y: 0.5 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1350, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.draw).toBe(false);
  });

  it('B faster → B wins', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1400, x: 0.5, y: 0.5 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1200, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.draw).toBe(false);
  });

  it('A false start → B wins', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 999, x: 0.5, y: 0.5 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1300, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.falseStart).toBe(PLAYER_A);
    expect(result.draw).toBe(false);
  });

  it('both false start → draw', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 998, x: 0.5, y: 0.5 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 999, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBeNull();
    expect(result.draw).toBe(true);
  });

  it('A misses target → B wins (if B hits)', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1200, x: 0.1, y: 0.1 }); // miss
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1300, x: 0.5, y: 0.5 }); // hit
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.draw).toBe(false);
  });

  it('both miss → draw', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1200, x: 0.1, y: 0.1 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1300, x: 0.1, y: 0.1 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBeNull();
    expect(result.draw).toBe(true);
  });

  it('A isTrusted=false → B wins', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1200, x: 0.5, y: 0.5, isTrusted: false });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1300, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.draw).toBe(false);
  });

  it('both below floor → draw', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1050, x: 0.5, y: 0.5 }); // 50ms
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1080, x: 0.5, y: 0.5 }); // 80ms
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBeNull();
    expect(result.draw).toBe(true);
  });

  it('reaction times within 1ms → draw', () => {
    const tapA = makeTap({ playerId: PLAYER_A, timestamp: 1200, x: 0.5, y: 0.5 });
    const tapB = makeTap({ playerId: PLAYER_B, timestamp: 1201, x: 0.5, y: 0.5 });
    const result = determineRoundWinner(tapA, tapB, prompt, promptTs, 1);
    expect(result.winnerId).toBeNull();
    expect(result.draw).toBe(true);
  });

  it('neither player taps → draw', () => {
    const result = determineRoundWinner(null, null, prompt, promptTs, 1);
    expect(result.winnerId).toBeNull();
    expect(result.draw).toBe(true);
  });
});

// ─── determineMatchWinner ───────────────────────────────────────────────────

describe('determineMatchWinner', () => {
  function round(winnerId: PlayerId | null, draw: boolean, roundNumber: number): RoundResult {
    return {
      roundNumber,
      winnerId,
      playerAReactionMs: 200,
      playerBReactionMs: 300,
      falseStart: null,
      draw,
    };
  }

  it('3-0 → winner is player with 3 wins', () => {
    const rounds = [
      round(PLAYER_A, false, 1),
      round(PLAYER_A, false, 2),
      round(PLAYER_A, false, 3),
    ];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.score).toEqual([3, 0]);
  });

  it('3-2 → winner is player with 3 wins', () => {
    const rounds = [
      round(PLAYER_A, false, 1),
      round(PLAYER_B, false, 2),
      round(PLAYER_A, false, 3),
      round(PLAYER_B, false, 4),
      round(PLAYER_A, false, 5),
    ];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.score).toEqual([3, 2]);
  });

  it('2-1 with 2 draws → player with more wins takes it', () => {
    const rounds = [
      round(PLAYER_A, false, 1),
      round(null, true, 2),
      round(PLAYER_B, false, 3),
      round(null, true, 4),
      round(PLAYER_A, false, 5),
    ];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_A);
    expect(result.score).toEqual([2, 1]);
  });

  it('2-2 with 1 draw → null (draw match)', () => {
    const rounds = [
      round(PLAYER_A, false, 1),
      round(PLAYER_B, false, 2),
      round(null, true, 3),
      round(PLAYER_A, false, 4),
      round(PLAYER_B, false, 5),
    ];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBeNull();
    expect(result.score).toEqual([2, 2]);
  });

  it('B wins 3-0', () => {
    const rounds = [
      round(PLAYER_B, false, 1),
      round(PLAYER_B, false, 2),
      round(PLAYER_B, false, 3),
    ];
    const result = determineMatchWinner(rounds, PLAYER_A, PLAYER_B);
    expect(result.winnerId).toBe(PLAYER_B);
    expect(result.score).toEqual([0, 3]);
  });
});
