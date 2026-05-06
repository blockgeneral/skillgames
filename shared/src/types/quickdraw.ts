import type { MatchId, MatchStatus, PlayerId, PlayerInfo, WagerAmount } from './common.js';

/** Shape of the visual prompt target */
export type PromptShape = 'circle' | 'square' | 'triangle';

/** Color of the visual prompt target */
export type PromptColor = 'red' | 'blue' | 'green' | 'yellow';

/** Position in normalized 0-1 coordinate space */
export interface PromptPosition {
  readonly x: number;
  readonly y: number;
}

/** Size of the prompt target in normalized units (radius or half-side) */
export type PromptSize = number;

/** Full prompt definition for a single round */
export interface Prompt {
  readonly shape: PromptShape;
  readonly color: PromptColor;
  readonly position: PromptPosition;
  readonly size: PromptSize;
}

/** Server-side round configuration (prompt + timing) */
export interface RoundConfig {
  readonly roundNumber: number;
  readonly delay: number;
  readonly prompt: Prompt;
  readonly promptHash: string;
}

/** Current phase of a single round */
export type RoundStatus = 'waiting' | 'delay' | 'prompted' | 'resolved';

/** Outcome of a completed round */
export interface RoundResult {
  readonly roundNumber: number;
  readonly winnerId: PlayerId | null;
  readonly playerAReactionMs: number | null;
  readonly playerBReactionMs: number | null;
  readonly falseStart: PlayerId | null;
  readonly draw: boolean;
}

/** Full state of a Quick Draw match */
export interface QuickDrawMatchState {
  readonly matchId: MatchId;
  readonly playerA: PlayerInfo;
  readonly playerB: PlayerInfo;
  readonly wagerAmount: WagerAmount;
  readonly currentRound: number;
  readonly rounds: RoundResult[];
  readonly status: MatchStatus;
  readonly roundConfigs: RoundConfig[];
}

/** Game-tuning constants for Quick Draw */
export const QUICK_DRAW_CONSTANTS = {
  TOTAL_ROUNDS: 5,
  ROUNDS_TO_WIN: 3,
  MIN_DELAY_MS: 1500,
  MAX_DELAY_MS: 4000,
  REACTION_FLOOR_MS: 120,
  REACTION_CEILING_MS: 2000,
  PROMPT_SHAPES: ['circle', 'square', 'triangle'] as const satisfies readonly PromptShape[],
  PROMPT_COLORS: ['red', 'blue', 'green', 'yellow'] as const satisfies readonly PromptColor[],
} as const;
