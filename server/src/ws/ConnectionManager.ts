import type { WebSocket } from 'ws';
import type { PlayerId, MatchId, Timestamp, WagerAmount } from '@skillgamez/shared';
import type { ServerMessage } from '@skillgamez/shared';
import type { TelegramUser } from '../auth/validateInitData.js';

export type ConnectionState = 'idle' | 'in_queue' | 'in_match';

export interface PlayerConnection {
  playerId: PlayerId;
  socket: WebSocket;
  user: TelegramUser;
  connectedAt: Timestamp;
  lastHeartbeat: Timestamp;
  state: ConnectionState;
  matchId: MatchId | null;
  lastMatchOpponent: PlayerId | null;
  lastMatchWager: WagerAmount | null;
}

export class ConnectionManager {
  private connections = new Map<string, PlayerConnection>();

  connect(playerId: PlayerId, socket: WebSocket, user: TelegramUser): void {
    // Close existing connection if duplicate
    const existing = this.connections.get(playerId);
    if (existing) {
      try {
        existing.socket.close(4001, 'duplicate_session');
      } catch {
        // Socket may already be closed
      }
    }

    const now = Date.now() as Timestamp;
    this.connections.set(playerId, {
      playerId,
      socket,
      user,
      connectedAt: now,
      lastHeartbeat: now,
      state: 'idle',
      matchId: null,
      lastMatchOpponent: null,
      lastMatchWager: null,
    });
  }

  disconnect(playerId: PlayerId): void {
    this.connections.delete(playerId);
  }

  getConnection(playerId: PlayerId): PlayerConnection | null {
    return this.connections.get(playerId) ?? null;
  }

  isConnected(playerId: PlayerId): boolean {
    return this.connections.has(playerId);
  }

  send(playerId: PlayerId, message: ServerMessage): void {
    const conn = this.connections.get(playerId);
    if (!conn) return;

    try {
      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(JSON.stringify(message));
      } else {
        this.disconnect(playerId);
      }
    } catch {
      this.disconnect(playerId);
    }
  }

  broadcast(playerIds: PlayerId[], message: ServerMessage): void {
    for (const id of playerIds) {
      this.send(id, message);
    }
  }

  updateHeartbeat(playerId: PlayerId): void {
    const conn = this.connections.get(playerId);
    if (conn) {
      conn.lastHeartbeat = Date.now() as Timestamp;
    }
  }

  getActiveCount(): number {
    return this.connections.size;
  }

  getAllConnections(): PlayerConnection[] {
    return Array.from(this.connections.values());
  }
}
