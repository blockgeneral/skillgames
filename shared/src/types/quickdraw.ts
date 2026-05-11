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

/** Full prompt definition for a single visual target */
export interface Prompt {
  readonly shape: PromptShape;
  readonly color: PromptColor;
  readonly position: PromptPosition;
  readonly size: PromptSize;
}

/** Configuration for a single prompt within a round */
export interface PromptConfig {
  readonly promptNumber: number;
  readonly delay: number;
  readonly prompt: Prompt;
  readonly promptHash: string;
}

/** Server-side round configuration (multiple prompts + timing) */
export interface RoundConfig {
  readonly roundNumber: number;
  readonly prompts: PromptConfig[];
  readonly roundHash: string;
}

/** Current phase of a single round */
export type RoundStatus = 'waiting' | 'delay' | 'prompted' | 'resolved';

/** Result of a single prompt within a round */
export interface PromptResult {
  readonly promptNumber: number;
  readonly playerId: PlayerId | null;
  readonly reactionMs: number | null;
  readonly hit: boolean;
  readonly falseStart: boolean;
  readonly missed: boolean;
  readonly timedOut: boolean;
}

/** Outcome of a completed round (8 prompts) */
export interface RoundResult {
  readonly roundNumber: number;
  readonly playerAResults: PromptResult[];
  readonly playerBResults: PromptResult[];
  readonly playerATotalMs: number;
  readonly playerBTotalMs: number;
  readonly winnerId: PlayerId | null;
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
  ROUNDS_PER_MATCH: 3,
  ROUNDS_TO_WIN: 2,
  PROMPTS_PER_ROUND: 8,
  FIRST_PROMPT_MIN_DELAY_MS: 1500,
  FIRST_PROMPT_MAX_DELAY_MS: 3000,
  INTER_PROMPT_MIN_DELAY_MS: 300,
  INTER_PROMPT_MAX_DELAY_MS: 1200,
  REACTION_FLOOR_MS: 120,
  REACTION_CEILING_MS: 2000,
  MISS_PENALTY_MS: 500,
  FALSE_START_PENALTY_MS: 1000,
  PROMPT_SHAPES: ['circle', 'square', 'triangle'] as const satisfies readonly PromptShape[],
  PROMPT_COLORS: ['red', 'blue', 'green', 'yellow'] as const satisfies readonly PromptColor[],
} as const;
