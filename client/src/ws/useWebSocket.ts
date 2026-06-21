import { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { PlayerId } from '@skillgamez/shared';
import type { ServerMessage, ClientMessage } from '@skillgamez/shared';

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:3001/ws`;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;

export interface WebSocketState {
  connected: boolean;
  playerId: PlayerId | null;
  displayName: string | null;
  send: (message: ClientMessage) => void;
  lastMessage: ServerMessage | null;
  error: string | null;
  connect: (userId: number, firstName: string) => void;
  disconnect: () => void;
}

export function useWebSocket(): WebSocketState {
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const authDataRef = useRef<{ userId: number; firstName: string } | null>(null);
  const intentionalCloseRef = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const doConnect = useCallback(() => {
    if (!authDataRef.current) return;
    cleanup();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      const initData = JSON.stringify({
        id: authDataRef.current!.userId,
        firstName: authDataRef.current!.firstName,
      });
      ws.send(JSON.stringify({ type: 'AUTH', initData }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        // flushSync ensures each message gets its own render cycle.
        // Without it, React 18 batching can merge rapid back-to-back
        // messages (e.g. MATCH_RESULT + BALANCE_UPDATE) into one render,
        // dropping the first message before any effect processes it.
        flushSync(() => {
          if (msg.type === 'AUTH_OK') {
            setPlayerId(msg.playerId);
            setDisplayName(msg.displayName);
            setConnected(true);
            setError(null);
          } else if (msg.type === 'ERROR') {
            setError(msg.message);
          }
          setLastMessage(msg);
        });
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      if (!intentionalCloseRef.current && authDataRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current);
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(doConnect, delay);
      }
    };

    ws.onerror = () => {
      setError('Connection error');
    };
  }, [cleanup]);

  const connect = useCallback((userId: number, firstName: string) => {
    authDataRef.current = { userId, firstName };
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    doConnect();
  }, [doConnect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    authDataRef.current = null;
    cleanup();
    setConnected(false);
    setPlayerId(null);
    setDisplayName(null);
    setLastMessage(null);
    setError(null);
  }, [cleanup]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return { connected, playerId, displayName, send, lastMessage, error, connect, disconnect };
}
