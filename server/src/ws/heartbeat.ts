import { HEARTBEAT_INTERVAL_MS } from '@skillgamez/shared';
import type { ConnectionManager } from './ConnectionManager.js';

const HEARTBEAT_SWEEP_MS = 30_000;
const HEARTBEAT_DEAD_MS = 45_000; // 3 missed heartbeats

let pingInterval: ReturnType<typeof setInterval> | undefined;
let sweepInterval: ReturnType<typeof setInterval> | undefined;

export function startHeartbeat(
  manager: ConnectionManager,
  onDead: (playerId: string) => void,
): void {
  // Send ping to all connections every HEARTBEAT_INTERVAL_MS
  pingInterval = setInterval(() => {
    for (const conn of manager.getAllConnections()) {
      try {
        if (conn.socket.readyState === conn.socket.OPEN) {
          conn.socket.ping();
        }
      } catch {
        // Socket error — will be cleaned up by sweep
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Sweep for dead connections every 30s
  sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const conn of manager.getAllConnections()) {
      if (now - conn.lastHeartbeat > HEARTBEAT_DEAD_MS) {
        console.log(`[Heartbeat] Dead connection: ${conn.playerId}`);
        onDead(conn.playerId);
      }
    }
  }, HEARTBEAT_SWEEP_MS);
}

export function stopHeartbeat(): void {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = undefined; }
  if (sweepInterval) { clearInterval(sweepInterval); sweepInterval = undefined; }
}
