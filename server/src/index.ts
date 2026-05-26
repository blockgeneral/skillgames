import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { connectRedis, disconnectRedis } from './redis/redisClient.js';
import { ConnectionManager } from './ws/ConnectionManager.js';
import { MatchmakingQueue } from './matchmaking/MatchmakingQueue.js';
import { DirectChallenge } from './matchmaking/DirectChallenge.js';
import { MatchRegistry } from './match/MatchRegistry.js';
import { GameSessionManager } from './game/GameSessionManager.js';
import { CoinBalanceManager } from './wallet/CoinBalance.js';
import { RematchHandler } from './matchmaking/RematchHandler.js';
import { registerWsRoute, clearGraceTimers } from './ws/wsRoute.js';
import { startHeartbeat, stopHeartbeat } from './ws/heartbeat.js';
import type { PlayerId } from '@skillgamez/shared';

const PORT = Number(process.env.PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export async function buildServer() {
  const app = Fastify({ logger: true });
  const manager = new ConnectionManager();
  const queue = new MatchmakingQueue();
  const challenge = new DirectChallenge();
  const matchRegistry = new MatchRegistry();
  const gameSessions = new GameSessionManager();
  const coinBalance = new CoinBalanceManager();
  const rematch = new RematchHandler();

  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    connections: manager.getActiveCount(),
    activeSessions: gameSessions.getActiveCount(),
  }));

  registerWsRoute(app, manager, queue, challenge, matchRegistry, gameSessions, coinBalance, rematch);

  return { app, manager, queue, challenge, matchRegistry, gameSessions, coinBalance, rematch };
}

async function main() {
  const { app, manager } = await buildServer();

  await connectRedis(REDIS_URL);
  app.log.info('Connected to Redis');

  startHeartbeat(manager, (pid) => {
    const conn = manager.getConnection(pid as PlayerId);
    if (conn) { try { conn.socket.close(4002, 'heartbeat_timeout'); } catch { /* ignore */ } }
    manager.disconnect(pid as PlayerId);
  });

  const shutdown = async () => {
    app.log.info('Shutting down...');
    stopHeartbeat();
    clearGraceTimers();
    for (const conn of manager.getAllConnections()) {
      try { conn.socket.close(1001, 'server_shutdown'); } catch { /* ignore */ }
    }
    await disconnectRedis();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectRun) {
  main().catch((err) => { console.error('Failed to start server:', err); process.exit(1); });
}
