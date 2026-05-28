import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { QUICK_DRAW_CONSTANTS, tonToCoins } from '@skillgamez/shared';
import { buildServer } from '../index.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../redis/redisClient.js';
import type { GameSessionManager } from '../game/GameSessionManager.js';
let app: FastifyInstance;
let wsUrl: string;
let gameSessions: GameSessionManager;

const openSockets: WebSocket[] = [];

// ─── Player handle ─────────────────────────────────────────────────────

interface PlayerHandle {
  ws: WebSocket;
  playerId: string;
  balance: number;
  send(msg: Record<string, unknown>): void;
  waitFor(type: string, timeoutMs?: number): Promise<Record<string, unknown>>;
  close(): void;
}

async function connectPlayer(id: number, name: string): Promise<PlayerHandle> {
  const ws = new WebSocket(wsUrl);
  openSockets.push(ws);

  const queue: Record<string, unknown>[] = [];
  type Listener = { check: (msg: Record<string, unknown>) => boolean; resolve: (msg: Record<string, unknown>) => void };
  const listeners: Listener[] = [];

  ws.on('message', (data: Buffer) => {
    const msg = JSON.parse(data.toString());
    for (let i = 0; i < listeners.length; i++) {
      if (listeners[i]!.check(msg)) {
        listeners[i]!.resolve(msg);
        listeners.splice(i, 1);
        return;
      }
    }
    queue.push(msg);
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Player ${id} WS open timeout`)), 5000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });

  function send(msg: Record<string, unknown>) {
    ws.send(JSON.stringify(msg));
  }

  function waitFor(type: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
    const idx = queue.findIndex(m => m.type === type);
    if (idx !== -1) return Promise.resolve(queue.splice(idx, 1)[0]!);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const li = listeners.findIndex(l => l === entry);
        if (li !== -1) listeners.splice(li, 1);
        const lastTypes = queue.map(m => m.type).join(', ');
        reject(new Error(`Player ${id} timed out waiting for ${type}. Queue: [${lastTypes}]`));
      }, timeoutMs);

      const entry: Listener = {
        check: (msg) => msg.type === type,
        resolve: (msg) => { clearTimeout(timer); resolve(msg); },
      };
      listeners.push(entry);
    });
  }

  function close() {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  send({ type: 'AUTH', initData: JSON.stringify({ id, firstName: name }) });
  const authOk = await waitFor('AUTH_OK');
  const balMsg = await waitFor('BALANCE_UPDATE');

  return {
    ws,
    playerId: authOk.playerId as string,
    balance: balMsg.balance as number,
    send,
    waitFor,
    close,
  };
}

// ─── Game play helpers ──────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function respondToPrompt(
  player: PlayerHandle,
  promptMsg: Record<string, unknown>,
  matchId: string,
): void {
  const prompt = promptMsg.prompt as { type: string; position: { x: number; y: number }; swipeDirection?: string };
  const roundNumber = promptMsg.roundNumber as number;
  const promptNumber = promptMsg.promptNumber as number;

  if (prompt.type === 'tap') {
    player.send({
      type: 'TAP', matchId, roundNumber, promptNumber,
      x: prompt.position.x, y: prompt.position.y,
      timestamp: Date.now(), isTrusted: true,
    });
  } else {
    const dir = prompt.swipeDirection!;
    let startX = 0.5, startY = 0.5, endX = 0.5, endY = 0.5;
    if (dir === 'right') endX = 0.9;
    else if (dir === 'left') endX = 0.1;
    else if (dir === 'down') endY = 0.9;
    else if (dir === 'up') endY = 0.1;
    player.send({
      type: 'SWIPE', matchId, roundNumber, promptNumber,
      startX, startY, endX, endY,
      timestamp: Date.now(), isTrusted: true,
    });
  }
}

async function playFullMatch(p1: PlayerHandle, p2: PlayerHandle, matchId: string): Promise<void> {
  p1.send({ type: 'PLAYER_READY', matchId });
  p2.send({ type: 'PLAYER_READY', matchId });

  await Promise.all([p1.waitFor('BOTH_READY'), p2.waitFor('BOTH_READY')]);

  for (let i = 0; i < 4; i++) {
    await Promise.all([p1.waitFor('COUNTDOWN'), p2.waitFor('COUNTDOWN')]);
  }

  for (let r = 0; r < QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH; r++) {
    await Promise.all([p1.waitFor('ROUND_START'), p2.waitFor('ROUND_START')]);

    for (let p = 0; p < QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND; p++) {
      const [prompt1, prompt2] = await Promise.all([
        p1.waitFor('PROMPT_SHOW'),
        p2.waitFor('PROMPT_SHOW'),
      ]);

      await sleep(130); // clear 120ms reaction floor

      respondToPrompt(p1, prompt1, matchId);
      respondToPrompt(p2, prompt2, matchId);

      const [res1, res2] = await Promise.all([
        p1.waitFor('PROMPT_RESULT'),
        p2.waitFor('PROMPT_RESULT'),
      ]);
      expect(res1.hit).toBe(true);
      expect(res2.hit).toBe(true);
    }

    await Promise.all([p1.waitFor('ROUND_RESULT'), p2.waitFor('ROUND_RESULT')]);
  }
}

async function queueAndMatch(p1: PlayerHandle, p2: PlayerHandle, wager: number): Promise<string> {
  p1.send({ type: 'JOIN_QUEUE', wagerAmount: wager });
  await p1.waitFor('QUEUE_JOINED');

  const matchP1 = p1.waitFor('MATCH_FOUND');
  p2.send({ type: 'JOIN_QUEUE', wagerAmount: wager });
  const match2 = await p2.waitFor('MATCH_FOUND');
  const match1 = await matchP1;

  expect(match1.matchId).toBe(match2.matchId);
  return match1.matchId as string;
}

// ─── Setup / teardown ───────────────────────────────────────────────────

async function flushRedis() {
  const redis = getRedisClient();
  for (const pattern of ['queue:*', 'match:*', 'player_match:*', 'session:*', 'challenge:*', 'player_challenge:*', 'balance:*', 'transactions:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
}

beforeAll(async () => {
  process.env.GAME_TIME_SCALE = '0.1';
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'redis://localhost:6379';

  await connectRedis(process.env.REDIS_URL);
  await flushRedis();

  // Clear any env contamination from other test files
  delete process.env.GAME_TIME_SCALE;
  process.env.GAME_TIME_SCALE = '0.1';

  const built = await buildServer();
  app = built.app;
  gameSessions = built.gameSessions;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr === 'string' || !addr) throw new Error('bad addr');
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
}, 15000);

beforeEach(async () => {
  await flushRedis();
});

afterEach(async () => {
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  openSockets.length = 0;
  await sleep(150);
});

afterAll(async () => {
  delete process.env.GAME_TIME_SCALE;
  await app.close();
  await disconnectRedis();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe('E2E Full Match', () => {
  it('full match: auth → queue → play 3 rounds → result with correct balances', async () => {
    const p1 = await connectPlayer(1001, 'Alice');
    const p2 = await connectPlayer(1002, 'Bob');

    expect(p1.balance).toBe(1000);
    expect(p2.balance).toBe(1000);

    const wager = 0.5;
    const wagerCoins = tonToCoins(wager);
    const matchId = await queueAndMatch(p1, p2, wager);

    await playFullMatch(p1, p2, matchId);

    const [result1, result2] = await Promise.all([
      p1.waitFor('MATCH_RESULT'),
      p2.waitFor('MATCH_RESULT'),
    ]);

    expect(result1.forfeit).toBe(false);
    expect(result2.forfeit).toBe(false);
    expect((result1.roundResults as unknown[]).length).toBe(3);

    // Verify coinsWon is coherent (winner gets wagerCoins, loser gets -wagerCoins)
    const coins1 = result1.coinsWon as number;
    const coins2 = result2.coinsWon as number;
    expect(coins1 + coins2).toBe(0); // zero-sum
    expect(Math.abs(coins1)).toBeLessThanOrEqual(wagerCoins);
    expect(Math.abs(coins2)).toBeLessThanOrEqual(wagerCoins);

    // Verify balances are present and positive
    expect(result1.yourNewBalance).toBeGreaterThan(0);
    expect(result2.yourNewBalance).toBeGreaterThan(0);

    await Promise.all([p1.waitFor('BALANCE_UPDATE'), p2.waitFor('BALANCE_UPDATE')]);

    // Both should be able to re-queue
    await sleep(200);
    p1.send({ type: 'JOIN_QUEUE', wagerAmount: 0.5 });
    const q1 = await p1.waitFor('QUEUE_JOINED');
    expect(q1.type).toBe('QUEUE_JOINED');
  }, 30000);

  it('rematch: both accept → new match plays through', async () => {
    const p1 = await connectPlayer(1101, 'Alice');
    const p2 = await connectPlayer(1102, 'Bob');

    const matchId1 = await queueAndMatch(p1, p2, 0.5);
    await playFullMatch(p1, p2, matchId1);
    await Promise.all([p1.waitFor('MATCH_RESULT'), p2.waitFor('MATCH_RESULT')]);
    await Promise.all([p1.waitFor('BALANCE_UPDATE'), p2.waitFor('BALANCE_UPDATE')]);
    await sleep(200);

    // p1 requests rematch
    p1.send({ type: 'REMATCH_REQUEST', matchId: matchId1 });
    const offered = await p2.waitFor('REMATCH_OFFERED');
    expect(offered.matchId).toBe(matchId1);

    // p2 accepts
    p2.send({ type: 'REMATCH_REQUEST', matchId: matchId1 });
    const [accept1, accept2] = await Promise.all([
      p1.waitFor('REMATCH_ACCEPTED'),
      p2.waitFor('REMATCH_ACCEPTED'),
    ]);
    expect(accept1.newMatchId).toBe(accept2.newMatchId);
    const matchId2 = accept1.newMatchId as string;
    expect(matchId2).not.toBe(matchId1);

    // Both get MATCH_FOUND for the new match
    await Promise.all([p1.waitFor('MATCH_FOUND'), p2.waitFor('MATCH_FOUND')]);

    // Play the rematch
    await playFullMatch(p1, p2, matchId2);
    const [r1, r2] = await Promise.all([
      p1.waitFor('MATCH_RESULT'),
      p2.waitFor('MATCH_RESULT'),
    ]);
    expect(r1.forfeit).toBe(false);
    expect(r2.forfeit).toBe(false);
  }, 60000);

  it('rematch decline: requester gets REMATCH_DECLINED', async () => {
    const p1 = await connectPlayer(1201, 'Alice');
    const p2 = await connectPlayer(1202, 'Bob');

    const matchId = await queueAndMatch(p1, p2, 0.5);
    await playFullMatch(p1, p2, matchId);
    await Promise.all([p1.waitFor('MATCH_RESULT'), p2.waitFor('MATCH_RESULT')]);
    await Promise.all([p1.waitFor('BALANCE_UPDATE'), p2.waitFor('BALANCE_UPDATE')]);
    await sleep(200);

    p1.send({ type: 'REMATCH_REQUEST', matchId });
    await p2.waitFor('REMATCH_OFFERED');

    p2.send({ type: 'REMATCH_DECLINE', matchId });
    const declined = await p1.waitFor('REMATCH_DECLINED');
    expect(declined.reason).toBe('Opponent declined');

    // Both can re-queue
    const matchId2 = await queueAndMatch(p1, p2, 0.5);
    expect(matchId2).not.toBe(matchId);
  }, 30000);

  it('disconnect forfeit: opponent wins and gets credited', async () => {
    const p1 = await connectPlayer(1301, 'Alice');
    const p2 = await connectPlayer(1302, 'Bob');

    const wager = 0.5;
    const wagerCoins = tonToCoins(wager);
    const matchId = await queueAndMatch(p1, p2, wager);

    // Start match, play to first prompt
    p1.send({ type: 'PLAYER_READY', matchId });
    p2.send({ type: 'PLAYER_READY', matchId });
    await Promise.all([p1.waitFor('BOTH_READY'), p2.waitFor('BOTH_READY')]);
    for (let i = 0; i < 4; i++) {
      await Promise.all([p1.waitFor('COUNTDOWN'), p2.waitFor('COUNTDOWN')]);
    }
    await Promise.all([p1.waitFor('ROUND_START'), p2.waitFor('ROUND_START')]);

    // Player 2 disconnects
    p2.close();
    await p1.waitFor('OPPONENT_DISCONNECTED');

    // Wait for scaled grace period (30s * 0.1 = 3s) + buffer
    await sleep(4000);

    // Player 1 gets MATCH_RESULT with forfeit
    const result = await p1.waitFor('MATCH_RESULT');
    expect(result.forfeit).toBe(true);

    // Player 1 gets BALANCE_UPDATE with winnings
    const balUpdate = await p1.waitFor('BALANCE_UPDATE');
    expect(balUpdate.balance).toBe(1000 - wagerCoins + wagerCoins * 2);

    // Player 2 reconnects and can re-queue
    const p2new = await connectPlayer(1302, 'Bob');
    expect(p2new.balance).toBe(1000 - wagerCoins);
    p2new.send({ type: 'JOIN_QUEUE', wagerAmount: 0.5 });
    const qj = await p2new.waitFor('QUEUE_JOINED');
    expect(qj.type).toBe('QUEUE_JOINED');
  }, 15000);

  it('insufficient balance: JOIN_QUEUE rejected', async () => {
    const p1 = await connectPlayer(1401, 'Broke');

    p1.send({ type: 'JOIN_QUEUE', wagerAmount: 25 });
    const err = await p1.waitFor('ERROR');
    expect(err.code).toBe('insufficient_balance');
  }, 5000);

  it('stale match cleanup on reconnect: player can re-queue', async () => {
    const p1 = await connectPlayer(1501, 'Alice');
    const p2 = await connectPlayer(1502, 'Bob');

    const matchId = await queueAndMatch(p1, p2, 0.5);

    // Simulate server restart: remove in-memory session, leave Redis keys
    gameSessions.removeSession(matchId as import('@skillgamez/shared').MatchId);

    // Reconnect player 1
    p1.close();
    await sleep(200);

    const p1new = await connectPlayer(1501, 'Alice');
    p1new.send({ type: 'JOIN_QUEUE', wagerAmount: 0.5 });
    const qj = await p1new.waitFor('QUEUE_JOINED');
    expect(qj.type).toBe('QUEUE_JOINED');
  }, 10000);
});
