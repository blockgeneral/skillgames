/** Branded type helper */
type Brand<T, B extends string> = T & { readonly __brand: B };

/** Unique player identifier */
export type PlayerId = Brand<string, 'PlayerId'>;

/** Unique match identifier */
export type MatchId = Brand<string, 'MatchId'>;

/** TON wallet address */
export type TonAddress = Brand<string, 'TonAddress'>;

/** Unix timestamp in milliseconds */
export type Timestamp = number;

/** Valid wager amounts in TON */
export type WagerAmount = 0.5 | 1 | 2 | 5 | 10 | 25;

/** Wager tier configuration */
export interface WagerTier {
  readonly amount: WagerAmount;
}

/** Overall match lifecycle status */
export type MatchStatus =
  | 'waiting_for_players'
  | 'waiting_for_deposits'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

/** Final result of a completed match */
export interface MatchResult {
  readonly winnerId: PlayerId;
  readonly loserId: PlayerId;
  readonly finalScore: [number, number];
  readonly payoutAmount: number;
  readonly platformFee: number;
  readonly txHash?: string;
}

/** Public player info visible to opponents */
export interface PlayerInfo {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly walletAddress: TonAddress;
}
