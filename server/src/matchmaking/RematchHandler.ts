import type { PlayerId, MatchId, WagerAmount } from '@skillgamez/shared';

function getRematchTimeout(): number {
  return 15_000 * Math.max(0.01, Number(process.env.GAME_TIME_SCALE ?? 1));
}

interface PendingRematch {
  matchId: MatchId;
  requesterId: PlayerId;
  opponentId: PlayerId;
  wagerAmount: WagerAmount;
  timer: ReturnType<typeof setTimeout>;
}

export class RematchHandler {
  // Keyed by original matchId
  private pending = new Map<string, PendingRematch>();

  request(
    matchId: MatchId,
    requesterId: PlayerId,
    opponentId: PlayerId,
    wagerAmount: WagerAmount,
    onTimeout: () => void,
  ): 'created' | 'accepted' {
    const existing = this.pending.get(matchId);

    if (existing && existing.requesterId === opponentId) {
      // The OTHER player already requested — this is acceptance
      clearTimeout(existing.timer);
      this.pending.delete(matchId);
      return 'accepted';
    }

    if (existing && existing.requesterId === requesterId) {
      // Already requested by this player — ignore
      return 'created';
    }

    // New request
    const timer = setTimeout(() => {
      this.pending.delete(matchId);
      onTimeout();
    }, getRematchTimeout());

    this.pending.set(matchId, { matchId, requesterId, opponentId, wagerAmount, timer });
    return 'created';
  }

  decline(matchId: MatchId, declinerId: PlayerId): PlayerId | null {
    const existing = this.pending.get(matchId);
    if (!existing) return null;
    if (existing.opponentId !== declinerId && existing.requesterId !== declinerId) return null;

    clearTimeout(existing.timer);
    this.pending.delete(matchId);
    return existing.requesterId;
  }

  getPending(matchId: MatchId): PendingRematch | null {
    return this.pending.get(matchId) ?? null;
  }

  cancelForPlayer(playerId: PlayerId): void {
    for (const [key, pending] of this.pending.entries()) {
      if (pending.requesterId === playerId || pending.opponentId === playerId) {
        clearTimeout(pending.timer);
        this.pending.delete(key);
      }
    }
  }

  clearAll(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }
}
