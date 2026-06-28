import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { PlayerId, PlayerInfo, TonAddress, SwipeDirection, MatchId } from '@skillgamez/shared';
import type { ClientMessage } from '@skillgamez/shared';
import { RECONNECT_GRACE_MS, VALID_WAGER_AMOUNTS, tonToCoins } from '@skillgamez/shared';
import type { WagerAmount } from '@skillgamez/shared';
import { validateInitData } from '../auth/validateInitData.js';
import { ConnectionManager } from './ConnectionManager.js';
import { MatchmakingQueue } from '../matchmaking/MatchmakingQueue.js';
import { DirectChallenge } from '../matchmaking/DirectChallenge.js';
import { MatchRegistry } from '../match/MatchRegistry.js';
import { GameSessionManager } from '../game/GameSessionManager.js';
import { CoinBalanceManager } from '../wallet/CoinBalance.js';
import { RematchHandler } from '../matchmaking/RematchHandler.js';
import { setSession, removeSession } from '../redis/sessionStore.js';
import { verifyDeposit } from '../wallet/DepositVerifier.js';
import { sendWithdrawal } from '../wallet/VaultWithdrawer.js';
import { coinsToTon } from '@skillgamez/shared';
import { getRedisClient } from '../redis/redisClient.js';

function getScaledGraceMs(): number {
  return RECONNECT_GRACE_MS * Math.max(0.01, Number(process.env.GAME_TIME_SCALE ?? 1));
}
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerWsRoute(
  app: FastifyInstance,
  manager: ConnectionManager,
  queue: MatchmakingQueue,
  challenge: DirectChallenge,
  matchRegistry: MatchRegistry,
  gameSessions: GameSessionManager,
  coinBalance: CoinBalanceManager,
  rematch: RematchHandler,
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

        // Clean up stale match state from previous session (server restart, unclean disconnect)
        const staleMatch = await matchRegistry.getByPlayer(playerId);
        if (staleMatch && staleMatch.status !== 'completed') {
          const activeSession = gameSessions.getSession(staleMatch.matchId);
          if (!activeSession) {
            // Match exists in Redis but not in memory — stale. Clean up.
            await matchRegistry.remove(staleMatch.matchId);
          } else {
            // Match exists in memory — check if opponent is still connected
            const opponentId = staleMatch.playerA === playerId ? staleMatch.playerB : staleMatch.playerA;
            const opponentConn = manager.getConnection(opponentId);
            if (!opponentConn) {
              // Opponent disconnected — clean up the stale match
              gameSessions.removeSession(staleMatch.matchId);
              await matchRegistry.updateStatus(staleMatch.matchId, 'cancelled');
              await matchRegistry.remove(staleMatch.matchId);
              socket.send(JSON.stringify({ type: 'MATCH_CANCELLED', matchId: staleMatch.matchId, reason: 'stale_match_cleanup' }));
            }
          }
        }

        // Send initial balance
        const balance = await coinBalance.getBalance(playerId);
        socket.send(JSON.stringify({ type: 'BALANCE_UPDATE', balance }));
        return;
      }

      // ─── Authenticated message routing ──────────────────────────
      const clientMsg = msg as unknown as ClientMessage;

      switch (clientMsg.type) {
        case 'JOIN_QUEUE': {
          if (!isValidWager(clientMsg.wagerAmount)) { sendError(socket, 'invalid_wager', 'Invalid wager amount'); break; }
          const existing = await matchRegistry.getByPlayer(playerId!);
          if (existing) { sendError(socket, 'already_in_match', 'Already in a match'); break; }

          // Check balance
          const wagerCoins = tonToCoins(clientMsg.wagerAmount);
          const canPay = await coinBalance.canAfford(playerId!, wagerCoins);
          if (!canPay) {
            const bal = await coinBalance.getBalance(playerId!);
            sendError(socket, 'insufficient_balance', `Need ${wagerCoins} Coins but you have ${bal}`);
            break;
          }

          const conn = manager.getConnection(playerId!);
          if (conn) conn.state = 'in_queue';

          const result = await queue.join(playerId!, clientMsg.wagerAmount);
          if (result) {
            await handleMatchFound(result.matchId, result.playerA, result.playerB, result.wagerAmount, manager, matchRegistry, gameSessions, coinBalance);
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

          const wagerCoins = tonToCoins(clientMsg.wagerAmount);
          const canPay = await coinBalance.canAfford(playerId!, wagerCoins);
          if (!canPay) {
            const bal = await coinBalance.getBalance(playerId!);
            sendError(socket, 'insufficient_balance', `Need ${wagerCoins} Coins but you have ${bal}`);
            break;
          }

          const code = challenge.create(playerId!, clientMsg.wagerAmount);
          socket.send(JSON.stringify({ type: 'CHALLENGE_CREATED', challengeCode: code, wagerAmount: clientMsg.wagerAmount }));
          break;
        }

        case 'JOIN_CHALLENGE': {
          const pendingChallenge = await challenge.getPending(clientMsg.challengeCode);
          if (pendingChallenge) {
            const wagerCoins = tonToCoins(pendingChallenge.wagerAmount);
            const canPay = await coinBalance.canAfford(playerId!, wagerCoins);
            if (!canPay) {
              const bal = await coinBalance.getBalance(playerId!);
              sendError(socket, 'insufficient_balance', `Need ${wagerCoins} Coins but you have ${bal}`);
              break;
            }
          }

          const result = await challenge.join(playerId!, clientMsg.challengeCode);
          if (!result) { socket.send(JSON.stringify({ type: 'CHALLENGE_INVALID', reason: 'Challenge not found or expired' })); break; }
          await handleMatchFound(result.matchId, result.playerA, result.playerB, result.wagerAmount, manager, matchRegistry, gameSessions, coinBalance);
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
          gameSessions.handleInput(playerId!, {
            type: 'tap',
            roundNumber: clientMsg.roundNumber,
            promptNumber: 0,
            x: 0, y: 0,
            timestamp: clientMsg.timestamp,
            isTrusted: true,
          });
          break;
        }

        case 'REMATCH_REQUEST': {
          await handleRematchRequest(playerId!, clientMsg.matchId, manager, matchRegistry, gameSessions, coinBalance, rematch);
          break;
        }

        case 'REMATCH_DECLINE': {
          const requesterId = rematch.decline(clientMsg.matchId, playerId!);
          if (requesterId) {
            manager.send(requesterId, { type: 'REMATCH_DECLINED', reason: 'Opponent declined' });
          }
          break;
        }

        case 'DEPOSIT_CONFIRMED':
          app.log.info(`[WS] ${playerId} sent ${clientMsg.type}`);
          break;

        case 'WALLET_CONNECTED': {
          const redis = getRedisClient();
          const existingWallet = await redis.get(`wallet:${playerId}`);
          const isFirstEver = existingWallet === null;

          // Update wallet mapping (always allowed)
          await redis.set(`wallet:${playerId}`, clientMsg.address);

          // Only reset balance on first-ever wallet connection (clears mock 1000 grant)
          if (isFirstEver) {
            await coinBalance.resetForWallet(playerId!);
            app.log.info(`[WS] ${playerId} first wallet connected: ${clientMsg.address}`);
          } else if (existingWallet !== clientMsg.address) {
            app.log.info(`[WS] ${playerId} switched wallet: ${existingWallet} → ${clientMsg.address}`);
          } else {
            app.log.info(`[WS] ${playerId} wallet reconnected: ${clientMsg.address}`);
          }

          const bal = await coinBalance.getBalance(playerId!);
          manager.send(playerId!, { type: 'BALANCE_UPDATE', balance: bal });
          break;
        }

        case 'DEPOSIT_SUBMITTED': {
          const redis = getRedisClient();
          const walletAddress = await redis.get(`wallet:${playerId}`);
          if (!walletAddress) {
            manager.send(playerId!, { type: 'DEPOSIT_FAILED', reason: 'No wallet connected' });
            break;
          }
          app.log.info(`[WS] ${playerId} submitted deposit: ${clientMsg.amount} TON`);
          // Verify asynchronously — don't block the message loop
          void (async () => {
            const result = await verifyDeposit(walletAddress, clientMsg.amount);
            if (result.confirmed) {
              const coins = Math.round(clientMsg.amount * 100);
              await coinBalance.credit(playerId!, coins, 'deposit');
              const newBal = await coinBalance.getBalance(playerId!);
              manager.send(playerId!, { type: 'DEPOSIT_CONFIRMED', newBalance: newBal, amount: coins });
              manager.send(playerId!, { type: 'BALANCE_UPDATE', balance: newBal });
              app.log.info(`[WS] ${playerId} deposit confirmed: +${coins} Coins`);
            } else {
              manager.send(playerId!, { type: 'DEPOSIT_FAILED', reason: result.reason ?? 'Transaction not found' });
            }
          })();
          break;
        }

        case 'WITHDRAW_REQUEST': {
          const redis = getRedisClient();
          const walletAddress = await redis.get(`wallet:${playerId}`);
          if (!walletAddress) {
            manager.send(playerId!, { type: 'WITHDRAW_FAILED', reason: 'No wallet connected' });
            break;
          }
          const amount = clientMsg.amount;
          if (typeof amount !== 'number' || amount < 10) {
            manager.send(playerId!, { type: 'WITHDRAW_FAILED', reason: 'Minimum withdrawal is 10 Coins' });
            break;
          }
          // Rate limit: one withdrawal per 60 seconds
          const rateLimitKey = `withdraw_cooldown:${playerId}`;
          const cooldown = await redis.get(rateLimitKey);
          if (cooldown) {
            manager.send(playerId!, { type: 'WITHDRAW_FAILED', reason: 'Please wait 60 seconds between withdrawals' });
            break;
          }

          app.log.info(`[WS] ${playerId} requested withdrawal: ${amount} Coins`);

          // Debit coins first (prevents double-withdraw)
          try {
            await coinBalance.debit(playerId!, amount, 'withdrawal');
          } catch {
            manager.send(playerId!, { type: 'WITHDRAW_FAILED', reason: 'Insufficient balance' });
            break;
          }

          // Set cooldown
          await redis.set(rateLimitKey, '1', 'EX', 60);

          // Convert coins to gross nanoTON for the vault contract
          const grossTon = coinsToTon(amount);
          const grossNano = BigInt(Math.round(grossTon * 1e9));

          // Send withdrawal asynchronously
          void (async () => {
            const result = await sendWithdrawal(walletAddress, grossNano);
            if (result.success) {
              const tonSent = grossTon * 0.9; // 10% fee deducted by contract
              const bal = await coinBalance.getBalance(playerId!);
              manager.send(playerId!, { type: 'WITHDRAW_CONFIRMED', coinsDeducted: amount, tonSent, newBalance: bal });
              manager.send(playerId!, { type: 'BALANCE_UPDATE', balance: bal });
              app.log.info(`[WS] ${playerId} withdrawal confirmed: -${amount} Coins, ~${tonSent} TON sent`);
            } else {
              // Re-credit on failure
              await coinBalance.credit(playerId!, amount, 'wager_refund');
              const bal = await coinBalance.getBalance(playerId!);
              manager.send(playerId!, { type: 'WITHDRAW_FAILED', reason: result.reason ?? 'Withdrawal failed' });
              manager.send(playerId!, { type: 'BALANCE_UPDATE', balance: bal });
              app.log.info(`[WS] ${playerId} withdrawal failed, re-credited ${amount} Coins`);
            }
          })();
          break;
        }

        default:
          sendError(socket, 'unknown_message_type', `Unknown message type: ${msg.type}`);
      }
    });

    socket.on('close', async () => {
      if (!playerId) return;
      const conn = manager.getConnection(playerId);
      // If connection was replaced by a new socket (duplicate session), skip cleanup
      if (conn && conn.socket !== socket) return;
      const wasInMatch = conn?.state === 'in_match';
      const wasInQueue = conn?.state === 'in_queue';

      manager.disconnect(playerId);
      if (wasInQueue) await queue.leave(playerId);
      await challenge.cancel(playerId);
      rematch.cancelForPlayer(playerId);

      if (wasInMatch && conn?.matchId) {
        gameSessions.handleDisconnect(playerId);
        const pid = playerId;
        const mid = conn.matchId as MatchId;
        const timer = setTimeout(async () => {
          graceTimers.delete(pid);

          // Forfeit — credit opponent
          const match = await matchRegistry.get(mid);
          if (match && match.status !== 'completed' && match.status !== 'cancelled') {
            const winnerId = pid === match.playerA ? match.playerB : match.playerA;
            const wagerCoins = tonToCoins(match.wagerAmount);
            try {
              await coinBalance.credit(winnerId, wagerCoins * 2, 'wager_win', mid);
              const winnerBal = await coinBalance.getBalance(winnerId);
              manager.send(winnerId, { type: 'BALANCE_UPDATE', balance: winnerBal });
            } catch { /* winner may have disconnected too */ }
          }

          gameSessions.handleForfeit(pid);
          await removeSession(pid);
          await matchRegistry.updateStatus(mid, 'cancelled');
          await matchRegistry.remove(mid);
        }, getScaledGraceMs());
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
  matchId: MatchId,
  playerA: PlayerId, playerB: PlayerId, wagerAmount: WagerAmount,
  manager: ConnectionManager, matchRegistry: MatchRegistry, gameSessions: GameSessionManager,
  coinBalance: CoinBalanceManager,
): Promise<void> {
  const wagerCoins = tonToCoins(wagerAmount);

  // Debit both players atomically
  let balA: number;
  let balB: number;
  try {
    balA = await coinBalance.debit(playerA, wagerCoins, 'wager_debit', matchId);
  } catch {
    // Player A can't afford — cancel match, notify both
    manager.send(playerA, { type: 'ERROR', code: 'insufficient_balance', message: 'Cannot afford wager' });
    manager.send(playerB, { type: 'ERROR', code: 'match_cancelled', message: 'Opponent has insufficient balance' });
    await matchRegistry.remove(matchId);
    return;
  }
  try {
    balB = await coinBalance.debit(playerB, wagerCoins, 'wager_debit', matchId);
  } catch {
    // Player B can't afford — refund A, cancel match
    await coinBalance.credit(playerA, wagerCoins, 'wager_refund', matchId);
    balA = await coinBalance.getBalance(playerA);
    manager.send(playerA, { type: 'BALANCE_UPDATE', balance: balA });
    manager.send(playerA, { type: 'ERROR', code: 'match_cancelled', message: 'Opponent has insufficient balance' });
    manager.send(playerB, { type: 'ERROR', code: 'insufficient_balance', message: 'Cannot afford wager' });
    await matchRegistry.remove(matchId);
    return;
  }

  const match = await matchRegistry.create(matchId, playerA, playerB, wagerAmount);

  for (const pid of [playerA, playerB]) {
    const conn = manager.getConnection(pid);
    if (conn) {
      conn.state = 'in_match';
      conn.matchId = matchId;
      conn.lastMatchOpponent = pid === playerA ? playerB : playerA;
      conn.lastMatchWager = wagerAmount;
    }
  }

  const connA = manager.getConnection(playerA);
  const connB = manager.getConnection(playerB);
  const infoA: PlayerInfo = { id: playerA, displayName: connA?.user.firstName ?? 'Player', walletAddress: '' as TonAddress };
  const infoB: PlayerInfo = { id: playerB, displayName: connB?.user.firstName ?? 'Player', walletAddress: '' as TonAddress };

  manager.send(playerA, { type: 'MATCH_FOUND', matchId, opponent: infoB, wagerAmount, yourBalance: balA });
  manager.send(playerB, { type: 'MATCH_FOUND', matchId, opponent: infoA, wagerAmount, yourBalance: balB });

  // Guard: sendBoth calls the callback twice (once per player),
  // but match result settlement must only run once.
  let matchResultHandled = false;

  gameSessions.createSession(match, (pid, msg) => {
    if (msg.type === 'MATCH_RESULT') {
      if (matchResultHandled) return; // second sendBoth invocation — skip
      matchResultHandled = true;

      // Reset connection state for both players
      for (const p of [playerA, playerB]) {
        const c = manager.getConnection(p);
        if (c) { c.state = 'idle'; c.matchId = null; }
      }

      if (msg.forfeit) {
        // Forfeit MATCH_RESULT — balance is handled in the disconnect handler,
        // but enrich with coinsWon so the winner's UI shows the correct result.
        const winnerId = msg.winnerId;
        const loserId = winnerId === playerA ? playerB : playerA;
        manager.send(winnerId ?? playerA, { ...msg, yourNewBalance: 0, coinsWon: wagerCoins });
        manager.send(loserId, { ...msg, yourNewBalance: 0, coinsWon: -wagerCoins });
        return;
      }

      // Credit winner asynchronously
      void (async () => {
        const winnerId = msg.winnerId;
        if (winnerId) {
          const loserId = winnerId === playerA ? playerB : playerA;
          await coinBalance.credit(winnerId, wagerCoins * 2, 'wager_win', matchId);
          const winBal = await coinBalance.getBalance(winnerId);
          const loseBal = await coinBalance.getBalance(loserId);
          manager.send(winnerId, { ...msg, yourNewBalance: winBal, coinsWon: wagerCoins });
          manager.send(loserId, { ...msg, yourNewBalance: loseBal, coinsWon: -wagerCoins });
          manager.send(winnerId, { type: 'BALANCE_UPDATE', balance: winBal });
          manager.send(loserId, { type: 'BALANCE_UPDATE', balance: loseBal });
        } else {
          // Draw — refund both
          await coinBalance.credit(playerA, wagerCoins, 'wager_refund', matchId);
          await coinBalance.credit(playerB, wagerCoins, 'wager_refund', matchId);
          const balANew = await coinBalance.getBalance(playerA);
          const balBNew = await coinBalance.getBalance(playerB);
          manager.send(playerA, { ...msg, yourNewBalance: balANew, coinsWon: 0 });
          manager.send(playerB, { ...msg, yourNewBalance: balBNew, coinsWon: 0 });
          manager.send(playerA, { type: 'BALANCE_UPDATE', balance: balANew });
          manager.send(playerB, { type: 'BALANCE_UPDATE', balance: balBNew });
        }
        await matchRegistry.updateStatus(matchId, 'completed');
        await matchRegistry.remove(matchId);
      })();
      return;
    }
    manager.send(pid, msg);
  });
}

async function handleRematchRequest(
  playerId: PlayerId,
  matchId: MatchId,
  manager: ConnectionManager,
  matchRegistry: MatchRegistry,
  gameSessions: GameSessionManager,
  coinBalance: CoinBalanceManager,
  rematchHandler: RematchHandler,
): Promise<void> {
  // Look up original match info from the pending rematch or connection state
  const pending = rematchHandler.getPending(matchId);

  // We need to know the opponent and wager amount. If there's a pending rematch,
  // we can get it from there. Otherwise, we need to figure out the opponent from
  // the original match context. Store this in the connection's metadata.
  const conn = manager.getConnection(playerId);
  if (!conn) return;

  // Get opponent and wager from existing pending or from connection lastMatch info
  let opponentId: PlayerId;
  let wagerAmount: WagerAmount;

  if (pending) {
    // Other player already requested — check if this player is the opponent
    opponentId = pending.requesterId;
    wagerAmount = pending.wagerAmount;
  } else if (conn.lastMatchOpponent && conn.lastMatchWager) {
    opponentId = conn.lastMatchOpponent;
    wagerAmount = conn.lastMatchWager;
  } else {
    sendError(conn.socket, 'rematch_failed', 'No match to rematch');
    return;
  }

  // Check balance
  const wagerCoins = tonToCoins(wagerAmount);
  const canPay = await coinBalance.canAfford(playerId, wagerCoins);
  if (!canPay) {
    sendError(conn.socket, 'insufficient_balance', 'Cannot afford rematch wager');
    return;
  }

  const opponentConn = manager.getConnection(opponentId);
  if (!opponentConn) {
    manager.send(playerId, { type: 'REMATCH_DECLINED', reason: 'Opponent left' });
    return;
  }

  const result = rematchHandler.request(
    matchId,
    playerId,
    opponentId,
    wagerAmount,
    () => {
      // Timeout callback
      manager.send(playerId, { type: 'REMATCH_DECLINED', reason: 'Opponent did not respond' });
    },
  );

  if (result === 'created') {
    // Notify opponent that a rematch was offered
    manager.send(opponentId, {
      type: 'REMATCH_OFFERED',
      matchId,
      opponentName: conn.user.firstName,
      wagerAmount,
    });
  } else if (result === 'accepted') {
    // Both accepted — check opponent can still afford
    const opCanPay = await coinBalance.canAfford(opponentId, wagerCoins);
    if (!opCanPay) {
      manager.send(playerId, { type: 'REMATCH_DECLINED', reason: 'Opponent has insufficient balance' });
      manager.send(opponentId, { type: 'REMATCH_DECLINED', reason: 'Insufficient balance for rematch' });
      return;
    }

    // Create new match
    const crypto = await import('node:crypto');
    const newMatchId = crypto.randomUUID() as MatchId;

    manager.send(playerId, { type: 'REMATCH_ACCEPTED', newMatchId });
    manager.send(opponentId, { type: 'REMATCH_ACCEPTED', newMatchId });

    await handleMatchFound(newMatchId, playerId, opponentId, wagerAmount, manager, matchRegistry, gameSessions, coinBalance);
  }
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
