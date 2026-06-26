import type { MatchId, PlayerId, PlayerInfo, Timestamp, WagerAmount } from './common.js';
import type { Prompt, PromptResult, RoundResult } from './quickdraw.js';

// ─── Server → Client messages ───────────────────────────────────────────────

export interface AuthOkMessage { readonly type: 'AUTH_OK'; readonly playerId: PlayerId; readonly displayName: string }
export interface QueueJoinedMessage { readonly type: 'QUEUE_JOINED'; readonly wagerAmount: WagerAmount; readonly position: number }
export interface QueueLeftMessage { readonly type: 'QUEUE_LEFT' }
export interface MatchFoundMessage { readonly type: 'MATCH_FOUND'; readonly matchId: MatchId; readonly opponent: PlayerInfo; readonly wagerAmount: WagerAmount; readonly yourBalance: number }
export interface ChallengeCreatedMessage { readonly type: 'CHALLENGE_CREATED'; readonly challengeCode: string; readonly wagerAmount: WagerAmount }
export interface ChallengeCancelledMessage { readonly type: 'CHALLENGE_CANCELLED' }
export interface ChallengeExpiredMessage { readonly type: 'CHALLENGE_EXPIRED' }
export interface ChallengeInvalidMessage { readonly type: 'CHALLENGE_INVALID'; readonly reason: string }

export interface WaitingForOpponentReadyMessage { readonly type: 'WAITING_FOR_OPPONENT_READY'; readonly matchId: MatchId }
export interface BothReadyMessage { readonly type: 'BOTH_READY'; readonly matchId: MatchId }
export interface CountdownMessage { readonly type: 'COUNTDOWN'; readonly matchId: MatchId; readonly step: string }

export interface PromptShowMessage {
  readonly type: 'PROMPT_SHOW'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly promptNumber: number; readonly prompt: Prompt; readonly timestamp: Timestamp;
}

export interface PromptResultMessage {
  readonly type: 'PROMPT_RESULT'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly promptNumber: number; readonly hit: boolean; readonly reactionMs: number | null;
  readonly missCount: number; readonly penaltyMs: number; readonly totalMs: number;
}

export interface OpponentProgressMessage {
  readonly type: 'OPPONENT_PROGRESS'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly promptNumber: number; readonly done: boolean;
}

export interface RoundStartMessage { readonly type: 'ROUND_START'; readonly matchId: MatchId; readonly roundNumber: number; readonly promptHash: string }

export interface RoundResultServerMessage {
  readonly type: 'ROUND_RESULT'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly playerATotalMs: number; readonly playerBTotalMs: number;
  readonly playerAResults: PromptResult[]; readonly playerBResults: PromptResult[];
  readonly winnerId: PlayerId | null;
}

export interface MatchResultServerMessage {
  readonly type: 'MATCH_RESULT'; readonly matchId: MatchId; readonly winnerId: PlayerId | null;
  readonly playerATotalMs: number; readonly playerBTotalMs: number;
  readonly roundResults: RoundResult[];
  readonly forfeit: boolean;
  readonly yourNewBalance: number; readonly coinsWon: number;
}

export interface MatchStateSyncMessage {
  readonly type: 'MATCH_STATE_SYNC'; readonly matchId: MatchId; readonly currentRound: number;
  readonly currentPrompt: number; readonly playerResults: PromptResult[][];
  readonly opponentProgress: number[]; readonly phase: string;
}

export interface DepositStatusMessage { readonly type: 'DEPOSIT_STATUS'; readonly matchId: MatchId; readonly playerADeposited: boolean; readonly playerBDeposited: boolean }
export interface ErrorMessage { readonly type: 'ERROR'; readonly code: string; readonly message: string }
export interface MatchCancelledMessage { readonly type: 'MATCH_CANCELLED'; readonly matchId: MatchId; readonly reason: string }
export interface OpponentDisconnectedMessage { readonly type: 'OPPONENT_DISCONNECTED'; readonly matchId: MatchId }

export interface BalanceUpdateMessage { readonly type: 'BALANCE_UPDATE'; readonly balance: number }
export interface WalletDepositConfirmedMessage { readonly type: 'DEPOSIT_CONFIRMED'; readonly newBalance: number; readonly amount: number }
export interface WalletDepositFailedMessage { readonly type: 'DEPOSIT_FAILED'; readonly reason: string }

export interface RematchOfferedMessage { readonly type: 'REMATCH_OFFERED'; readonly matchId: MatchId; readonly opponentName: string; readonly wagerAmount: WagerAmount }
export interface RematchAcceptedMessage { readonly type: 'REMATCH_ACCEPTED'; readonly newMatchId: MatchId }
export interface RematchDeclinedMessage { readonly type: 'REMATCH_DECLINED'; readonly reason: string }

export type ServerMessage =
  | AuthOkMessage | QueueJoinedMessage | QueueLeftMessage | MatchFoundMessage
  | ChallengeCreatedMessage | ChallengeCancelledMessage | ChallengeExpiredMessage | ChallengeInvalidMessage
  | WaitingForOpponentReadyMessage | BothReadyMessage | CountdownMessage
  | PromptShowMessage | PromptResultMessage | OpponentProgressMessage
  | RoundStartMessage | RoundResultServerMessage | MatchResultServerMessage | MatchStateSyncMessage
  | DepositStatusMessage | ErrorMessage | MatchCancelledMessage | OpponentDisconnectedMessage
  | BalanceUpdateMessage | WalletDepositConfirmedMessage | WalletDepositFailedMessage
  | RematchOfferedMessage | RematchAcceptedMessage | RematchDeclinedMessage;

// ─── Client → Server messages ───────────────────────────────────────────────

export interface AuthMessage { readonly type: 'AUTH'; readonly initData: string }
export interface JoinQueueMessage { readonly type: 'JOIN_QUEUE'; readonly wagerAmount: WagerAmount }
export interface LeaveQueueMessage { readonly type: 'LEAVE_QUEUE' }
export interface CreateChallengeMessage { readonly type: 'CREATE_CHALLENGE'; readonly wagerAmount: WagerAmount }
export interface JoinChallengeMessage { readonly type: 'JOIN_CHALLENGE'; readonly challengeCode: string }
export interface CancelChallengeMessage { readonly type: 'CANCEL_CHALLENGE' }
export interface PlayerReadyMessage { readonly type: 'PLAYER_READY'; readonly matchId: MatchId }
export interface DepositConfirmedMessage { readonly type: 'DEPOSIT_CONFIRMED'; readonly matchId: MatchId; readonly txHash: string }

export interface TapMessage {
  readonly type: 'TAP'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly promptNumber: number; readonly x: number; readonly y: number;
  readonly timestamp: Timestamp; readonly isTrusted: boolean;
}

export interface SwipeMessage {
  readonly type: 'SWIPE'; readonly matchId: MatchId; readonly roundNumber: number;
  readonly promptNumber: number; readonly startX: number; readonly startY: number;
  readonly endX: number; readonly endY: number; readonly timestamp: Timestamp; readonly isTrusted: boolean;
}

export interface FalseStartMessage { readonly type: 'FALSE_START'; readonly matchId: MatchId; readonly roundNumber: number; readonly timestamp: Timestamp }
export interface RematchRequestMessage { readonly type: 'REMATCH_REQUEST'; readonly matchId: MatchId }
export interface RematchDeclineMessage { readonly type: 'REMATCH_DECLINE'; readonly matchId: MatchId }
export interface WalletConnectedMessage { readonly type: 'WALLET_CONNECTED'; readonly address: string }
export interface DepositSubmittedMessage { readonly type: 'DEPOSIT_SUBMITTED'; readonly txHash: string; readonly amount: number }

export type ClientMessage =
  | AuthMessage | JoinQueueMessage | LeaveQueueMessage
  | CreateChallengeMessage | JoinChallengeMessage | CancelChallengeMessage
  | PlayerReadyMessage | DepositConfirmedMessage
  | TapMessage | SwipeMessage | FalseStartMessage | RematchRequestMessage | RematchDeclineMessage
  | WalletConnectedMessage | DepositSubmittedMessage;
