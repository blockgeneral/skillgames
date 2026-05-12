import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildServer } from '../index.js';
import { connectRedis, disconnectRedis } from '../redis/redisClient.js';
import type { ConnectionManager } from '../ws/ConnectionManager.js';

let app: FastifyInstance;
let manager: ConnectionManager;
let baseUrl: string;
let wsUrl: string;

function makeInitData(id: number, firstName: string, username?: string): string {
  return JSON.stringify({ id, firstName, username });
}

function connectWs(): WebSocket {
  return new WebSocket(wsUrl);
}

function sendAuth(ws: WebSocket, id: number, firstName: string): void {
  ws.send(JSON.stringify({ type: 'AUTH', initData: makeInitData(id, firstName) }));
}

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for message')), 5000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for close')), 5000);
    ws.once('close', (code: number, reason: Buffer) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for open')), 5000);
    ws.once('open', () => { clearTimeout(timeout); resolve(); });
    ws.once('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'redis://localhost:6379';

  await connectRedis(process.env.REDIS_URL);
  const server = await buildServer();
  app = server.app;
  manager = server.manager;

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr === 'string' || !addr) throw new Error('Unexpected address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

afterAll(async () => {
  for (const conn of manager.getAllConnections()) {
    try { conn.socket.close(); } catch { /* ignore */ }
  }
  await app.close();
  await disconnectRedis();
});

describe('HTTP', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.connections).toBe('number');
  });
});

describe('WebSocket auth', () => {
  it('connect and auth → receives AUTH_OK', async () => {
    const ws = connectWs();
    await waitForOpen(ws);
    sendAuth(ws, 1001, 'Alice');

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('AUTH_OK');
    expect(msg.playerId).toBe('tg:1001');
    expect(msg.displayName).toBe('Alice');

    ws.close();
  });

  it('invalid auth → ERROR + close 4000', async () => {
    const ws = connectWs();
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'AUTH', initData: 'not-json' }));

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('auth_failed');

    const close = await waitForClose(ws);
    expect(close.code).toBe(4000);
  });

  it('non-AUTH first message → ERROR + close 4000', async () => {
    const ws = connectWs();
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'JOIN_QUEUE', wagerAmount: 1 }));

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('auth_required');

    const close = await waitForClose(ws);
    expect(close.code).toBe(4000);
  });
});

describe('Duplicate session', () => {
  it('second connection with same user closes the first', async () => {
    const ws1 = connectWs();
    await waitForOpen(ws1);
    sendAuth(ws1, 2001, 'Bob');
    await waitForMessage(ws1); // AUTH_OK

    const closePromise = waitForClose(ws1);

    const ws2 = connectWs();
    await waitForOpen(ws2);
    sendAuth(ws2, 2001, 'Bob');
    const msg2 = await waitForMessage(ws2);
    expect(msg2.type).toBe('AUTH_OK');

    const close1 = await closePromise;
    expect(close1.code).toBe(4001);

    ws2.close();
  });
});

describe('Unknown message type', () => {
  it('sends ERROR for unknown message type', async () => {
    const ws = connectWs();
    await waitForOpen(ws);
    sendAuth(ws, 3001, 'Charlie');
    await waitForMessage(ws); // AUTH_OK

    ws.send(JSON.stringify({ type: 'BOGUS' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('ERROR');
    expect(msg.code).toBe('unknown_message_type');

    ws.close();
  });
});

describe('Two players connected', () => {
  it('health shows correct connection count', async () => {
    const ws1 = connectWs();
    await waitForOpen(ws1);
    sendAuth(ws1, 4001, 'Dave');
    await waitForMessage(ws1);

    const ws2 = connectWs();
    await waitForOpen(ws2);
    sendAuth(ws2, 4002, 'Eve');
    await waitForMessage(ws2);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(body.connections).toBeGreaterThanOrEqual(2);

    ws1.close();
    ws2.close();

    // Wait for close to propagate
    await new Promise(r => setTimeout(r, 100));
  });
});
