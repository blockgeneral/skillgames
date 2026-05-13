import type { MatchId, PlayerId, PlayerInfo, Timestamp, WagerAmount } from './common.js';

// ─── Server → Client messages ───────────────────────────────────────────────

export interface AuthOkMessage {
  readonly type: 'AUTH_OK';
  readonly playerId: PlayerId;
  readonly displayName: string;
}

export interface QueueJoinedMessage {
  readonly type: 'QUEUE_JOINED';
  readonly wagerAmount: WagerAmount;
  readonly position: number;
}

export interface QueueLeftMessage {
  readonly type: 'QUEUE_LEFT';
}

export interface MatchFoundMessage {
  readonly type: 'MATCH_FOUND';
  readonly matchId: MatchId;
  readonly opponent: PlayerInfo;
  readonly wagerAmount: WagerAmount;
}

export interface ChallengeCreatedMessage {
  readonly type: 'CHALLENGE_CREATED';
  readonly challengeCode: string;
  readonly wagerAmount: WagerAmount;
}

export interface ChallengeCancelledMessage {
  readonly type: 'CHALLENGE_CANCELLED';
}

export interface ChallengeExpiredMessage {
  readonly type: 'CHALLENGE_EXPIRED';
}

export interface ChallengeInvalidMessage {
  readonly type: 'CHALLENGE_INVALID';
  readonly reason: string;
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
  readonly roundCount: number;
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
  | AuthOkMessage
  | QueueJoinedMessage
  | QueueLeftMessage
  | MatchFoundMessage
  | ChallengeCreatedMessage
  | ChallengeCancelledMessage
  | ChallengeExpiredMessage
  | ChallengeInvalidMessage
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

export interface AuthMessage {
  readonly type: 'AUTH';
  readonly initData: string;
}

export interface JoinQueueMessage {
  readonly type: 'JOIN_QUEUE';
  readonly wagerAmount: WagerAmount;
}

export interface LeaveQueueMessage {
  readonly type: 'LEAVE_QUEUE';
}

export interface CreateChallengeMessage {
  readonly type: 'CREATE_CHALLENGE';
  readonly wagerAmount: WagerAmount;
}

export interface JoinChallengeMessage {
  readonly type: 'JOIN_CHALLENGE';
  readonly challengeCode: string;
}

export interface CancelChallengeMessage {
  readonly type: 'CANCEL_CHALLENGE';
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
  | AuthMessage
  | JoinQueueMessage
  | LeaveQueueMessage
  | CreateChallengeMessage
  | JoinChallengeMessage
  | CancelChallengeMessage
  | DepositConfirmedMessage
  | TapMessage
  | FalseStartMessage
  | RematchRequestMessage;
