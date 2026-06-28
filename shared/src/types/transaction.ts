export type TransactionType = 'deposit' | 'withdrawal' | 'wager_debit' | 'wager_win' | 'wager_loss' | 'wager_draw';

export interface Transaction {
  readonly id: string;
  readonly type: TransactionType;
  readonly amount: number;
  readonly fee?: number;
  readonly balanceAfter: number;
  readonly timestamp: number;
  readonly matchId?: string;
  readonly opponentName?: string;
  readonly txHash?: string;
}
