import type { PlayerId, MatchId } from '@skillgamez/shared';
import type { ServerMessage } from '@skillgamez/shared';
import type { ActiveMatch } from '../match/MatchRegistry.js';
import { QuickDrawSession } from './QuickDrawSession.js';
import type { PlayerInput } from './QuickDrawSession.js';

export class GameSessionManager {
  private sessions = new Map<string, QuickDrawSession>();
  private playerToMatch = new Map<string, string>();

  createSession(
    match: ActiveMatch,
    send: (playerId: PlayerId, msg: ServerMessage) => void,
  ): QuickDrawSession {
    const session = new QuickDrawSession(match, send, (matchId) => {
      this.removeSession(matchId);
    });
    this.sessions.set(match.matchId, session);
    this.playerToMatch.set(match.playerA, match.matchId);
    this.playerToMatch.set(match.playerB, match.matchId);
    return session;
  }

  getSession(matchId: MatchId): QuickDrawSession | null {
    return this.sessions.get(matchId) ?? null;
  }

  getSessionByPlayer(playerId: PlayerId): QuickDrawSession | null {
    const matchId = this.playerToMatch.get(playerId);
    if (!matchId) return null;
    return this.sessions.get(matchId) ?? null;
  }

  handleReady(playerId: PlayerId, matchId: MatchId): void {
    const session = this.sessions.get(matchId);
    if (session) session.handleReady(playerId);
  }

  handleInput(playerId: PlayerId, input: PlayerInput): void {
    const session = this.getSessionByPlayer(playerId);
    if (session) session.handleInput(playerId, input);
  }

  handleDisconnect(playerId: PlayerId): void {
    const session = this.getSessionByPlayer(playerId);
    if (session) session.handleDisconnect(playerId);
  }

  handleForfeit(playerId: PlayerId): void {
    const session = this.getSessionByPlayer(playerId);
    if (session) session.forfeit(playerId);
  }

  removeSession(matchId: MatchId): void {
    const session = this.sessions.get(matchId);
    if (session) {
      session.destroy();
      this.playerToMatch.delete(session.playerA);
      this.playerToMatch.delete(session.playerB);
      this.sessions.delete(matchId);
    }
  }

  getActiveCount(): number {
    return this.sessions.size;
  }
}
