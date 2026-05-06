import type { WagerAmount } from '@skillgamez/shared';
import type { RoundConfig, Prompt } from '@skillgamez/shared';

export type GamePhase =
  | { kind: 'start' }
  | { kind: 'get-ready'; roundNumber: number }
  | { kind: 'delay'; roundNumber: number }
  | { kind: 'prompted'; roundNumber: number; promptAppearedAt: number }
  | { kind: 'round-result'; roundNumber: number; outcome: RoundOutcome }
  | { kind: 'match-result' };

export type RoundOutcome =
  | { type: 'hit'; reactionMs: number; opponentMs: number; youWon: boolean }
  | { type: 'miss'; opponentMs: number }
  | { type: 'false-start' }
  | { type: 'too-slow'; opponentMs: number }
  | { type: 'draw'; reactionMs: number; opponentMs: number };

export interface MatchState {
  seed: string;
  wagerAmount: WagerAmount;
  rounds: RoundConfig[];
  currentRound: number;
  score: [number, number];
  roundOutcomes: RoundOutcome[];
  playerReactionTimes: (number | null)[];
  opponentReactionTimes: (number | null)[];
}

export interface DebugInfo {
  phase: string;
  lastTapNormalized: { x: number; y: number } | null;
  lastReactionMs: number | null;
  lastOnTarget: boolean | null;
  currentPrompt: Prompt | null;
  seed: string;
}
