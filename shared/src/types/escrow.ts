import type { MatchId, TonAddress } from './common.js';

/** On-chain escrow match state */
export interface EscrowMatch {
  readonly matchId: MatchId;
  readonly playerA: TonAddress;
  readonly playerB: TonAddress;
  readonly wagerAmount: number;
  readonly status: 'awaiting_deposits' | 'funded' | 'completed' | 'refunded' | 'timed_out';
  readonly deposits: {
    readonly playerA: boolean;
    readonly playerB: boolean;
  };
}

/** Interface for escrow contract interactions (mock and real implementations) */
export interface EscrowInterface {
  createMatch(matchId: MatchId, playerA: TonAddress, playerB: TonAddress, wagerAmount: number): Promise<void>;
  deposit(matchId: MatchId, player: TonAddress): Promise<void>;
  reportWinner(matchId: MatchId, winner: TonAddress): Promise<{ payoutTxHash: string }>;
  refund(matchId: MatchId): Promise<void>;
  timeout(matchId: MatchId): Promise<void>;
  getMatch(matchId: MatchId): Promise<EscrowMatch | null>;
}
