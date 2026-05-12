import type { PlayerId, WagerAmount, Prompt, PromptResult, RoundConfig, RoundResult, SwipeDirection } from '@skillgamez/shared';

export type PromptFeedback = 'hit' | 'miss' | 'false_start' | 'timeout';

export type PromptStatus = 'upcoming' | 'hit' | 'miss' | 'false_start' | 'timeout';

export type GamePhase =
  | { kind: 'start' }
  | { kind: 'tutorial' }
  | { kind: 'countdown'; value: number }
  | { kind: 'round_header'; roundIndex: number }
  | { kind: 'prompt_delay'; roundIndex: number; promptIndex: number }
  | { kind: 'prompt_active'; roundIndex: number; promptIndex: number; promptAppearedAt: number }
  | { kind: 'prompt_feedback'; roundIndex: number; promptIndex: number; feedbackType: PromptFeedback; tapPosition?: { x: number; y: number } }
  | { kind: 'round_result'; roundIndex: number }
  | { kind: 'match_result' };

export interface GameInput {
  normalizedX: number;
  normalizedY: number;
  timestamp: number;
  isTrusted: boolean;
  gestureType: 'tap' | 'swipe' | 'false_start';
  swipeDirection?: SwipeDirection;
}

export interface MatchState {
  readonly seed: string;
  readonly wagerAmount: WagerAmount;
  readonly roundConfigs: RoundConfig[];
  readonly playerResults: PromptResult[][];
  readonly opponentResults: PromptResult[][];
  readonly roundResults: RoundResult[];
  readonly score: [number, number];
}

export const PLAYER_ID = 'player' as PlayerId;
export const OPPONENT_ID = 'opponent' as PlayerId;

export interface DebugInfo {
  phase: string;
  roundIndex: number;
  promptIndex: number;
  totalPrompts: number;
  lastTapNormalized: { x: number; y: number } | null;
  lastReactionMs: number | null;
  lastOnTarget: boolean | null;
  currentPrompt: Prompt | null;
  seed: string;
  runningScore: number;
  opponentRoundResults: PromptResult[] | null;
}
