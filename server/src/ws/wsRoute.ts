import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { PlayerId } from '@skillgamez/shared';
import type { ClientMessage } from '@skillgamez/shared';
import { RECONNECT_GRACE_MS } from '@skillgamez/shared';
import { validateInitData } from '../auth/validateInitData.js';
import { ConnectionManager } from './ConnectionManager.js';
import { setSession, removeSession } from '../redis/sessionStore.js';

const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerWsRoute(app: FastifyInstance, manager: ConnectionManager): void {
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    let playerId: PlayerId | null = null;
    let authenticated = false;

    // Wait for AUTH message
    socket.on('message', async (raw: Buffer) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendError(socket, 'invalid_json', 'Could not parse message');
        return;
      }

      // Handle AUTH
      if (!authenticated) {
        if (msg.type !== 'AUTH' || typeof msg.initData !== 'string') {
          sendError(socket, 'auth_required', 'First message must be AUTH with initData');
          socket.close(4000, 'auth_required');
          return;
        }

        const user = validateInitData(msg.initData as string);
        if (!user) {
          sendError(socket, 'auth_failed', 'Invalid initData');
          socket.close(4000, 'auth_failed');
          return;
        }

        playerId = `tg:${user.id}` as PlayerId;
        authenticated = true;

        // Cancel reconnect grace timer if one exists
        const graceTimer = graceTimers.get(playerId);
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimers.delete(playerId);
        }

        manager.connect(playerId, socket, user);

        await setSession(playerId, {
          userId: user.id,
          displayName: user.firstName,
          state: 'idle',
        });

        socket.send(JSON.stringify({
          type: 'AUTH_OK',
          playerId,
          displayName: user.firstName,
        }));

        // Setup pong handler for heartbeat tracking
        socket.on('pong', () => {
          if (playerId) manager.updateHeartbeat(playerId);
        });

        return;
      }

      // Authenticated — route messages
      const clientMsg = msg as unknown as ClientMessage;
      switch (clientMsg.type) {
        case 'JOIN_QUEUE':
          console.log(`[WS] ${playerId} wants to join queue`);
          break;
        case 'LEAVE_QUEUE':
          console.log(`[WS] ${playerId} wants to leave queue`);
          break;
        case 'DEPOSIT_CONFIRMED':
          console.log(`[WS] ${playerId} confirmed deposit`);
          break;
        case 'TAP':
          console.log(`[WS] ${playerId} tapped`);
          break;
        case 'FALSE_START':
          console.log(`[WS] ${playerId} false started`);
          break;
        case 'REMATCH_REQUEST':
          console.log(`[WS] ${playerId} requested rematch`);
          break;
        default:
          sendError(socket, 'unknown_message_type', `Unknown message type: ${msg.type}`);
      }
    });

    socket.on('close', async () => {
      if (!playerId) return;

      const conn = manager.getConnection(playerId);
      const wasInMatch = conn?.state === 'in_match';

      manager.disconnect(playerId);

      if (wasInMatch) {
        // Start reconnect grace timer
        console.log(`[WS] ${playerId} disconnected during match, grace period ${RECONNECT_GRACE_MS}ms`);
        const timer = setTimeout(async () => {
          graceTimers.delete(playerId!);
          console.log(`[WS] ${playerId} reconnect grace expired — forfeit`);
          await removeSession(playerId!);
          // TODO: Handle match forfeit in Session 6
        }, RECONNECT_GRACE_MS);
        graceTimers.set(playerId, timer);
      } else {
        await removeSession(playerId);
      }
    });

    socket.on('error', (err) => {
      console.error(`[WS] Socket error for ${playerId ?? 'unauthenticated'}:`, err.message);
    });
  });
}

function sendError(socket: WebSocket, code: string, message: string): void {
  try {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'ERROR', code, message }));
    }
  } catch {
    // Ignore send failures
  }
}

export function clearGraceTimers(): void {
  for (const timer of graceTimers.values()) {
    clearTimeout(timer);
  }
  graceTimers.clear();
}
