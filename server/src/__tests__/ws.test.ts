import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildServer } from '../index.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../redis/redisClient.js';

let app: FastifyInstance;
let wsUrl: string;
let baseUrl: string;

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

function waitClose(ws: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('close timeout')), 5000);
    ws.once('close', (code: number) => { clearTimeout(t); resolve({ code }); });
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
  const msg = await waitMsg(ws);
  return { ws, msg };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'redis://localhost:6379';
  await connectRedis(process.env.REDIS_URL);

  // Clean all test state from Redis
  const redis = getRedisClient();
  for (const pattern of ['queue:*', 'match:*', 'player_match:*', 'session:*', 'challenge:*', 'player_challenge:*']) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }

  const built = await buildServer();
  app = built.app;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr === 'string' || !addr) throw new Error('bad addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterEach(async () => {
  // Close all sockets opened during test
  for (const ws of openSockets) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  openSockets.length = 0;
  await new Promise(r => setTimeout(r, 50));
});

afterAll(async () => {
  await app.close();
  await disconnectRedis();
});

// ─── Auth ───────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('valid auth → AUTH_OK', async () => {
    const { msg } = await authWs(100, 'Alice');
    expect(msg.type).toBe('AUTH_OK');
    expect(msg.playerId).toBe('tg:100');
  });

  it('invalid auth → ERROR + close 4000', async () => {
    const ws = connectWs();
    await waitOpen(ws);
    ws.send(JSON.stringify({ type: 'AUTH', initData: 'bad' }));
    const msg = await waitMsg(ws);
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('auth_failed');
    const close = await waitClose(ws);
    expect(close.code).toBe(4000);
  });

  it('duplicate session closes old connection', async () => {
    const { ws: ws1 } = await authWs(200, 'Bob');
    const closeP = waitClose(ws1);
    const { msg: msg2 } = await authWs(200, 'Bob');
    expect(msg2.type).toBe('AUTH_OK');
    const close1 = await closeP;
    expect(close1.code).toBe(4001);
  });
});

// ─── Health ─────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });
});

// ─── Queue matchmaking ─────────────────────────────────────────────────

describe('Queue matchmaking', () => {
  it('two players join same tier → both get MATCH_FOUND', async () => {
    const { ws: wsA } = await authWs(301, 'PlayerA');
    const { ws: wsB } = await authWs(302, 'PlayerB');

    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));
    const queueMsg = await waitMsg(wsA);
    expect(queueMsg.type).toBe('QUEUE_JOINED');

    // Start listening for A's MATCH_FOUND BEFORE B joins (avoids race)
    const matchAPromise = waitMsg(wsA);
    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));

    const matchB = await waitMsg(wsB);
    expect(matchB.type).toBe('MATCH_FOUND');
    expect(matchB.wagerAmount).toBe(1);

    const matchA = await matchAPromise;
    expect(matchA.type).toBe('MATCH_FOUND');
    expect(matchA.matchId).toBe(matchB.matchId);
  });

  it('different tiers → no match', async () => {
    const { ws: wsA } = await authWs(303, 'PA');
    const { ws: wsB } = await authWs(304, 'PB');

    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));
    const qa = await waitMsg(wsA);
    expect(qa.type).toBe('QUEUE_JOINED');

    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 5 }));
    const qb = await waitMsg(wsB);
    expect(qb.type).toBe('QUEUE_JOINED');
    // Neither gets MATCH_FOUND — they're in different queues
  });

  it('leave queue → QUEUE_LEFT, next player waits', async () => {
    const { ws: wsA } = await authWs(305, 'PA');
    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 2 }));
    await waitMsg(wsA); // QUEUE_JOINED

    wsA.send(JSON.stringify({ type: 'LEAVE_QUEUE' }));
    const left = await waitMsg(wsA);
    expect(left.type).toBe('QUEUE_LEFT');

    const { ws: wsB } = await authWs(306, 'PB');
    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 2 }));
    const qb = await waitMsg(wsB);
    expect(qb.type).toBe('QUEUE_JOINED'); // No match — A already left
  });

  it('disconnect during queue cleans up', async () => {
    const { ws: wsA } = await authWs(307, 'PA');
    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 0.5 }));
    await waitMsg(wsA);

    wsA.close();
    await new Promise(r => setTimeout(r, 100));

    const { ws: wsB } = await authWs(308, 'PB');
    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 0.5 }));
    const qb = await waitMsg(wsB);
    expect(qb.type).toBe('QUEUE_JOINED'); // A was cleaned up
  });

  it('switching tiers removes from old queue', async () => {
    const { ws: wsA } = await authWs(309, 'PA');

    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));
    await waitMsg(wsA); // QUEUE_JOINED for 1 TON

    wsA.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 5 }));
    await waitMsg(wsA); // QUEUE_JOINED for 5 TON

    // Another player joins 1 TON — should NOT match with A
    const { ws: wsB } = await authWs(310, 'PB');
    wsB.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));
    const qb = await waitMsg(wsB);
    expect(qb.type).toBe('QUEUE_JOINED'); // No match
  });
});

// ─── Direct challenge ───────────────────────────────────────────────────

describe('Direct challenge', () => {
  it('create + join → both get MATCH_FOUND', async () => {
    const { ws: wsA } = await authWs(401, 'Creator');
    wsA.send(JSON.stringify({ type: 'CREATE_CHALLENGE', wagerAmount: 2 }));
    const created = await waitMsg(wsA);
    expect(created.type).toBe('CHALLENGE_CREATED');
    const code = created.challengeCode as string;
    expect(code).toHaveLength(6);

    // Start listening for A's MATCH_FOUND BEFORE B joins
    const matchAPromise = waitMsg(wsA);

    const { ws: wsB } = await authWs(402, 'Joiner');
    wsB.send(JSON.stringify({ type: 'JOIN_CHALLENGE', challengeCode: code }));

    const matchB = await waitMsg(wsB);
    expect(matchB.type).toBe('MATCH_FOUND');

    const matchA = await matchAPromise;
    expect(matchA.type).toBe('MATCH_FOUND');
    expect(matchA.matchId).toBe(matchB.matchId);
  });

  it('cancel then join → CHALLENGE_INVALID', async () => {
    const { ws: wsA } = await authWs(403, 'Creator');
    wsA.send(JSON.stringify({ type: 'CREATE_CHALLENGE', wagerAmount: 1 }));
    const created = await waitMsg(wsA);
    const code = created.challengeCode as string;

    wsA.send(JSON.stringify({ type: 'CANCEL_CHALLENGE' }));
    await waitMsg(wsA); // CHALLENGE_CANCELLED

    const { ws: wsB } = await authWs(404, 'Joiner');
    wsB.send(JSON.stringify({ type: 'JOIN_CHALLENGE', challengeCode: code }));
    const invalid = await waitMsg(wsB);
    expect(invalid.type).toBe('CHALLENGE_INVALID');
  });
});

// ─── Unknown message ────────────────────────────────────────────────────

describe('Unknown message', () => {
  it('sends ERROR for unknown type', async () => {
    const { ws } = await authWs(500, 'X');
    ws.send(JSON.stringify({ type: 'BOGUS' }));
    const msg = await waitMsg(ws);
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('unknown_message_type');
  });
});
