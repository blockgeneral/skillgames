import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { connectRedis, disconnectRedis } from './redis/redisClient.js';
import { ConnectionManager } from './ws/ConnectionManager.js';
import { registerWsRoute, clearGraceTimers } from './ws/wsRoute.js';
import { startHeartbeat, stopHeartbeat } from './ws/heartbeat.js';

const PORT = Number(process.env.PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export async function buildServer() {
  const app = Fastify({ logger: true });
  const manager = new ConnectionManager();

  await app.register(fastifyWebsocket);

  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    connections: manager.getActiveCount(),
  }));

  registerWsRoute(app, manager);

  return { app, manager };
}

async function main() {
  const { app, manager } = await buildServer();

  await connectRedis(REDIS_URL);
  app.log.info('Connected to Redis');

  startHeartbeat(manager, (playerId) => {
    const conn = manager.getConnection(playerId as import('@skillgamez/shared').PlayerId);
    if (conn) {
      try { conn.socket.close(4002, 'heartbeat_timeout'); } catch { /* ignore */ }
    }
    manager.disconnect(playerId as import('@skillgamez/shared').PlayerId);
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

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
