import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { PlayerId, PlayerInfo, TonAddress, SwipeDirection } from '@skillgamez/shared';
import type { ClientMessage } from '@skillgamez/shared';
import { RECONNECT_GRACE_MS, VALID_WAGER_AMOUNTS } from '@skillgamez/shared';
import type { WagerAmount } from '@skillgamez/shared';
import { validateInitData } from '../auth/validateInitData.js';
import { ConnectionManager } from './ConnectionManager.js';
import { MatchmakingQueue } from '../matchmaking/MatchmakingQueue.js';
import { DirectChallenge } from '../matchmaking/DirectChallenge.js';
import { MatchRegistry } from '../match/MatchRegistry.js';
import { GameSessionManager } from '../game/GameSessionManager.js';
import { setSession, removeSession } from '../redis/sessionStore.js';

const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerWsRoute(
  app: FastifyInstance,
  manager: ConnectionManager,
  queue: MatchmakingQueue,
  challenge: DirectChallenge,
  matchRegistry: MatchRegistry,
  gameSessions: GameSessionManager,
): void {
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    let playerId: PlayerId | null = null;
    let authenticated = false;

    socket.on('message', async (raw: Buffer) => {
      let msg: { type: string; [key: string]: unknown };
      try { msg = JSON.parse(raw.toString()); } catch {
        sendError(socket, 'invalid_json', 'Could not parse message');
        return;
      }

      // ─── AUTH ───────────────────────────────────────────────────
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

        const graceTimer = graceTimers.get(playerId);
        if (graceTimer) { clearTimeout(graceTimer); graceTimers.delete(playerId); }

        manager.connect(playerId, socket, user);
        await setSession(playerId, { userId: user.id, displayName: user.firstName, state: 'idle' });
        socket.send(JSON.stringify({ type: 'AUTH_OK', playerId, displayName: user.firstName }));
        socket.on('pong', () => { if (playerId) manager.updateHeartbeat(playerId); });
        return;
      }

      // ─── Authenticated message routing ──────────────────────────
      const clientMsg = msg as unknown as ClientMessage;

      switch (clientMsg.type) {
        case 'JOIN_QUEUE': {
          if (!isValidWager(clientMsg.wagerAmount)) { sendError(socket, 'invalid_wager', 'Invalid wager amount'); break; }
          const existing = await matchRegistry.getByPlayer(playerId!);
          if (existing) { sendError(socket, 'already_in_match', 'Already in a match'); break; }

          const conn = manager.getConnection(playerId!);
          if (conn) conn.state = 'in_queue';

          const result = await queue.join(playerId!, clientMsg.wagerAmount);
          if (result) {
            await handleMatchFound(result.matchId, result.playerA, result.playerB, result.wagerAmount, manager, matchRegistry, gameSessions);
          } else {
            const pos = await queue.getPosition(playerId!, clientMsg.wagerAmount);
            socket.send(JSON.stringify({ type: 'QUEUE_JOINED', wagerAmount: clientMsg.wagerAmount, position: pos }));
          }
          break;
        }

        case 'LEAVE_QUEUE': {
          await queue.leave(playerId!);
          const conn = manager.getConnection(playerId!);
          if (conn) conn.state = 'idle';
          socket.send(JSON.stringify({ type: 'QUEUE_LEFT' }));
          break;
        }

        case 'CREATE_CHALLENGE': {
          if (!isValidWager(clientMsg.wagerAmount)) { sendError(socket, 'invalid_wager', 'Invalid wager amount'); break; }
          const code = challenge.create(playerId!, clientMsg.wagerAmount);
          socket.send(JSON.stringify({ type: 'CHALLENGE_CREATED', challengeCode: code, wagerAmount: clientMsg.wagerAmount }));
          break;
        }

        case 'JOIN_CHALLENGE': {
          const result = await challenge.join(playerId!, clientMsg.challengeCode);
          if (!result) { socket.send(JSON.stringify({ type: 'CHALLENGE_INVALID', reason: 'Challenge not found or expired' })); break; }
          await handleMatchFound(result.matchId, result.playerA, result.playerB, result.wagerAmount, manager, matchRegistry, gameSessions);
          break;
        }

        case 'CANCEL_CHALLENGE': {
          const cancelled = await challenge.cancel(playerId!);
          if (cancelled) socket.send(JSON.stringify({ type: 'CHALLENGE_CANCELLED' }));
          break;
        }

        case 'PLAYER_READY': {
          gameSessions.handleReady(playerId!, clientMsg.matchId);
          break;
        }

        case 'TAP': {
          gameSessions.handleInput(playerId!, {
            type: 'tap',
            roundNumber: clientMsg.roundNumber,
            promptNumber: clientMsg.promptNumber,
            x: clientMsg.x, y: clientMsg.y,
            timestamp: clientMsg.timestamp,
            isTrusted: clientMsg.isTrusted,
          });
          break;
        }

        case 'SWIPE': {
          const dx = clientMsg.endX - clientMsg.startX;
          const dy = clientMsg.endY - clientMsg.startY;
          let direction: SwipeDirection;
          if (Math.abs(dx) > Math.abs(dy)) { direction = dx > 0 ? 'right' : 'left'; }
          else { direction = dy > 0 ? 'down' : 'up'; }

          gameSessions.handleInput(playerId!, {
            type: 'swipe',
            roundNumber: clientMsg.roundNumber,
            promptNumber: clientMsg.promptNumber,
            startX: clientMsg.startX, startY: clientMsg.startY,
            endX: clientMsg.endX, endY: clientMsg.endY,
            swipeDirection: direction,
            timestamp: clientMsg.timestamp,
            isTrusted: clientMsg.isTrusted,
          });
          break;
        }

        case 'FALSE_START': {
          // Treated as a tap during delay (the session handles it as false start)
          gameSessions.handleInput(playerId!, {
            type: 'tap',
            roundNumber: clientMsg.roundNumber,
            promptNumber: 0, // Will be mapped to current prompt by session
            x: 0, y: 0,
            timestamp: clientMsg.timestamp,
            isTrusted: true,
          });
          break;
        }

        case 'DEPOSIT_CONFIRMED':
        case 'REMATCH_REQUEST':
          app.log.info(`[WS] ${playerId} sent ${clientMsg.type}`);
          break;

        default:
          sendError(socket, 'unknown_message_type', `Unknown message type: ${msg.type}`);
      }
    });

    socket.on('close', async () => {
      if (!playerId) return;
      const conn = manager.getConnection(playerId);
      const wasInMatch = conn?.state === 'in_match';
      const wasInQueue = conn?.state === 'in_queue';

      manager.disconnect(playerId);
      if (wasInQueue) await queue.leave(playerId);
      await challenge.cancel(playerId);

      if (wasInMatch && conn?.matchId) {
        gameSessions.handleDisconnect(playerId);
        const pid = playerId;
        const timer = setTimeout(async () => {
          graceTimers.delete(pid);
          gameSessions.handleForfeit(pid);
          await removeSession(pid);
          await matchRegistry.updateStatus(conn!.matchId!, 'cancelled');
        }, RECONNECT_GRACE_MS);
        graceTimers.set(playerId, timer);
      } else {
        await removeSession(playerId);
      }
    });

    socket.on('error', (err) => {
      app.log.error(`Socket error for ${playerId ?? 'unauthenticated'}: ${err.message}`);
    });
  });
}

async function handleMatchFound(
  matchId: import('@skillgamez/shared').MatchId,
  playerA: PlayerId, playerB: PlayerId, wagerAmount: WagerAmount,
  manager: ConnectionManager, matchRegistry: MatchRegistry, gameSessions: GameSessionManager,
): Promise<void> {
  const match = await matchRegistry.create(matchId, playerA, playerB, wagerAmount);

  for (const pid of [playerA, playerB]) {
    const conn = manager.getConnection(pid);
    if (conn) { conn.state = 'in_match'; conn.matchId = matchId; }
  }

  const connA = manager.getConnection(playerA);
  const connB = manager.getConnection(playerB);
  const infoA: PlayerInfo = { id: playerA, displayName: connA?.user.firstName ?? 'Player', walletAddress: '' as TonAddress };
  const infoB: PlayerInfo = { id: playerB, displayName: connB?.user.firstName ?? 'Player', walletAddress: '' as TonAddress };

  manager.send(playerA, { type: 'MATCH_FOUND', matchId, opponent: infoB, wagerAmount });
  manager.send(playerB, { type: 'MATCH_FOUND', matchId, opponent: infoA, wagerAmount });

  // Create game session
  gameSessions.createSession(match, (pid, msg) => manager.send(pid, msg));
}

function isValidWager(amount: unknown): amount is WagerAmount {
  return VALID_WAGER_AMOUNTS.includes(amount as WagerAmount);
}

function sendError(socket: WebSocket, code: string, message: string): void {
  try { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'ERROR', code, message })); } catch { /* ignore */ }
}

export function clearGraceTimers(): void {
  for (const timer of graceTimers.values()) clearTimeout(timer);
  graceTimers.clear();
}
