import type { MatchId, PlayerId, PlayerInfo, Timestamp, WagerAmount } from './common.js';

// ─── Server → Client messages ───────────────────────────────────────────────

export interface MatchFoundMessage {
  readonly type: 'MATCH_FOUND';
  readonly matchId: MatchId;
  readonly opponent: PlayerInfo;
  readonly wagerAmount: WagerAmount;
}

export interface DepositStatusMessage {
  readonly type: 'DEPOSIT_STATUS';
  readonly matchId: MatchId;
  readonly playerADeposited: boolean;
  readonly playerBDeposited: boolean;
}

export interface MatchStartMessage {
  readonly type: 'MATCH_START';
  readonly matchId: MatchId;
  readonly roundCount: 5;
}

export interface RoundStartMessage {
  readonly type: 'ROUND_START';
  readonly matchId: MatchId;
  readonly roundNumber: number;
  readonly promptHash: string;
}

export interface PromptMessage {
  readonly type: 'PROMPT';
  readonly matchId: MatchId;
  readonly roundNumber: number;
  readonly shape: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly timestamp: Timestamp;
}

export interface RoundResultMessage {
  readonly type: 'ROUND_RESULT';
  readonly matchId: MatchId;
  readonly roundNumber: number;
  readonly winnerId: PlayerId | null;
  readonly playerAReactionMs: number | null;
  readonly playerBReactionMs: number | null;
  readonly falseStart: PlayerId | null;
}

export interface MatchResultMessage {
  readonly type: 'MATCH_RESULT';
  readonly matchId: MatchId;
  readonly winnerId: PlayerId;
  readonly roundWins: [number, number];
  readonly payoutAmount: number;
  readonly platformFee: number;
  readonly txHash?: string;
}

export interface ErrorMessage {
  readonly type: 'ERROR';
  readonly code: string;
  readonly message: string;
}

export interface MatchCancelledMessage {
  readonly type: 'MATCH_CANCELLED';
  readonly matchId: MatchId;
  readonly reason: string;
}

export interface OpponentDisconnectedMessage {
  readonly type: 'OPPONENT_DISCONNECTED';
  readonly matchId: MatchId;
}

/** Discriminated union of all server-to-client messages */
export type ServerMessage =
  | MatchFoundMessage
  | DepositStatusMessage
  | MatchStartMessage
  | RoundStartMessage
  | PromptMessage
  | RoundResultMessage
  | MatchResultMessage
  | ErrorMessage
  | MatchCancelledMessage
  | OpponentDisconnectedMessage;

// ─── Client → Server messages ───────────────────────────────────────────────

export interface JoinQueueMessage {
  readonly type: 'JOIN_QUEUE';
  readonly wagerAmount: WagerAmount;
}

export interface LeaveQueueMessage {
  readonly type: 'LEAVE_QUEUE';
}

export interface DepositConfirmedMessage {
  readonly type: 'DEPOSIT_CONFIRMED';
  readonly matchId: MatchId;
  readonly txHash: string;
}

export interface TapMessage {
  readonly type: 'TAP';
  readonly matchId: MatchId;
  readonly roundNumber: number;
  readonly x: number;
  readonly y: number;
  readonly timestamp: Timestamp;
  readonly isTrusted: boolean;
}

export interface FalseStartMessage {
  readonly type: 'FALSE_START';
  readonly matchId: MatchId;
  readonly roundNumber: number;
  readonly timestamp: Timestamp;
}

export interface RematchRequestMessage {
  readonly type: 'REMATCH_REQUEST';
  readonly matchId: MatchId;
}

/** Discriminated union of all client-to-server messages */
export type ClientMessage =
  | JoinQueueMessage
  | LeaveQueueMessage
  | DepositConfirmedMessage
  | TapMessage
  | FalseStartMessage
  | RematchRequestMessage;
