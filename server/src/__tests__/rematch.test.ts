import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildServer } from '../index.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../redis/redisClient.js';

let app: FastifyInstance;
let wsUrl: string;

const openSockets: WebSocket[] = [];

function makeInitData(id: number, firstName: string): string {
  return JSON.stringify({ id, firstName });
}

function connectWs(): WebSocket {
  const ws = new WebSocket(wsUrl);
  openSockets.push(ws);
  return ws;
}

function waitMsg(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('msg timeout')), 5000);
    ws.once('message', (d: Buffer) => { clearTimeout(t); resolve(JSON.parse(d.toString())); });
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('open timeout')), 5000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

async function authWs(id: number, name: string): Promise<{ ws: WebSocket; msg: Record<string, unknown> }> {
  const ws = connectWs();
  await waitOpen(ws);
  ws.send(JSON.stringify({ type: 'AUTH', initData: makeInitData(id, name) }));
  const msg = await waitMsg(ws); // AUTH_OK
  await waitMsg(ws); // BALANCE_UPDATE
  return { ws, msg };
}

async function createMatch(idA: number, nameA: string, idB: number, nameB: string, wager: number): Promise<{
  wsA: WebSocket; wsB: WebSocket; matchId: string;
}> {
  const { ws: wsA } = await authWs(idA, nameA);
  const { ws: wsB } = await authWs(idB, nameB);

  wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: wager }));
  await waitMsg(wsA); // QUEUE_JOINED

  const matchAPromise = waitMsg(wsA);
  wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: wager }));

  const matchB = await waitMsg(wsB);
  expect(matchB.type).toBe('MATCH_FOUND');

  const matchA = await matchAPromise;
  expect(matchA.type).toBe('MATCH_FOUND');

  return { wsA, wsB, matchId: matchA.matchId as string };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'redis://localhost:6379';
  await connectRedis(process.env.REDIS_URL);

  const redis = getRedisClient();
  for (const pattern of ['queue:*', 'match:*', 'player_match:*', 'session:*', 'challenge:*', 'player_challenge:*', 'balance:*', 'transactions:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }

  const built = await buildServer();
  app = built.app;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr === 'string' || !addr) throw new Error('bad addr');
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterEach(async () => {
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  openSockets.length = 0;
  await new Promise(r => setTimeout(r, 50));

  // Clean Redis state between tests
  const redis = getRedisClient();
  for (const pattern of ['queue:*', 'match:*', 'player_match:*', 'session:*', 'balance:*', 'transactions:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
});

afterAll(async () => {
  await app.close();
  await disconnectRedis();
});

describe('Coin balance in match lifecycle', () => {
  it('AUTH sends BALANCE_UPDATE with initial 1000 Coins', async () => {
    const ws = connectWs();
    await waitOpen(ws);
    ws.send(JSON.stringify({ type: 'AUTH', initData: makeInitData(600, 'Tester') }));
    const authOk = await waitMsg(ws);
    expect(authOk.type).toBe('AUTH_OK');
    const balMsg = await waitMsg(ws);
    expect(balMsg.type).toBe('BALANCE_UPDATE');
    expect(balMsg.balance).toBe(1000);
  });

  it('MATCH_FOUND includes yourBalance after wager debit', async () => {
    const { ws: wsA } = await authWs(601, 'PA');
    const { ws: wsB } = await authWs(602, 'PB');

    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));
    await waitMsg(wsA); // QUEUE_JOINED

    const matchAP = waitMsg(wsA);
    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));

    const matchB = await waitMsg(wsB);
    expect(matchB.type).toBe('MATCH_FOUND');
    // 1 TON = 100 Coins. 1000 - 100 = 900
    expect(matchB.yourBalance).toBe(900);

    const matchA = await matchAP;
    expect(matchA.type).toBe('MATCH_FOUND');
    expect(matchA.yourBalance).toBe(900);
  });

  it('insufficient balance blocks JOIN_QUEUE', async () => {
    const { ws: wsA } = await authWs(603, 'Poor');

    // Try to join with wager of 25 TON = 2500 Coins (only have 1000)
    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 25 }));
    const errMsg = await waitMsg(wsA);
    expect(errMsg.type).toBe('ERROR');
    expect(errMsg.code).toBe('insufficient_balance');
  });
});

describe('Rematch flow', () => {
  it('one player requests rematch → opponent gets REMATCH_OFFERED', async () => {
    const { wsA, wsB, matchId } = await createMatch(701, 'PA', 702, 'PB', 1);

    // Simulate that match is "complete" by sending REMATCH_REQUEST
    wsA.send(JSON.stringify({ type: 'REMATCH_REQUEST', matchId }));
    const offered = await waitMsg(wsB);
    expect(offered.type).toBe('REMATCH_OFFERED');
    expect(offered.matchId).toBe(matchId);
    expect(offered.wagerAmount).toBe(1);
  });

  it('one player declines → requester gets REMATCH_DECLINED', async () => {
    const { wsA, wsB, matchId } = await createMatch(703, 'PA', 704, 'PB', 1);

    wsA.send(JSON.stringify({ type: 'REMATCH_REQUEST', matchId }));
    await waitMsg(wsB); // REMATCH_OFFERED

    wsB.send(JSON.stringify({ type: 'REMATCH_DECLINE', matchId }));
    const declined = await waitMsg(wsA);
    expect(declined.type).toBe('REMATCH_DECLINED');
    expect(declined.reason).toBe('Opponent declined');
  });

  it('opponent disconnects → requester gets REMATCH_DECLINED', async () => {
    const { wsA, matchId } = await createMatch(705, 'PA', 706, 'PB', 1);

    // Close player B before rematch request
    openSockets[1]!.close();
    await new Promise(r => setTimeout(r, 100));

    wsA.send(JSON.stringify({ type: 'REMATCH_REQUEST', matchId }));
    const declined = await waitMsg(wsA);
    expect(declined.type).toBe('REMATCH_DECLINED');
    expect(declined.reason).toBe('Opponent left');
  });
});
