import { useState, useEffect, useCallback } from 'react';
import type { WagerAmount, MatchId, PlayerInfo } from '@skillgamez/shared';
import { VALID_WAGER_AMOUNTS } from '@skillgamez/shared';
import type { WebSocketState } from '../ws/useWebSocket.js';

interface Props {
  ws: WebSocketState;
  onMatchFound: (matchId: MatchId, opponent: PlayerInfo, wagerAmount: WagerAmount) => void;
  onBack: () => void;
}

type LobbyTab = 'quick' | 'challenge';
type LobbyState =
  | { kind: 'idle' }
  | { kind: 'searching'; wagerAmount: WagerAmount }
  | { kind: 'creating_challenge'; wagerAmount: WagerAmount; code: string }
  | { kind: 'joining_challenge' }
  | { kind: 'found'; opponentName: string };

export function LobbyScreen({ ws, onMatchFound, onBack }: Props): JSX.Element {
  const [tab, setTab] = useState<LobbyTab>('quick');
  const [selected, setSelected] = useState<WagerAmount>(1);
  const [state, setState] = useState<LobbyState>({ kind: 'idle' });
  const [challengeInput, setChallengeInput] = useState('');

  // Handle incoming messages
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg) return;

    switch (msg.type) {
      case 'QUEUE_JOINED':
        setState({ kind: 'searching', wagerAmount: msg.wagerAmount });
        break;
      case 'QUEUE_LEFT':
        setState({ kind: 'idle' });
        break;
      case 'MATCH_FOUND':
        setState({ kind: 'found', opponentName: msg.opponent.displayName });
        setTimeout(() => {
          onMatchFound(msg.matchId, msg.opponent, msg.wagerAmount);
        }, 1500);
        break;
      case 'CHALLENGE_CREATED':
        setState({ kind: 'creating_challenge', wagerAmount: msg.wagerAmount, code: msg.challengeCode });
        break;
      case 'CHALLENGE_CANCELLED':
        setState({ kind: 'idle' });
        break;
      case 'CHALLENGE_INVALID':
        setState({ kind: 'idle' });
        break;
    }
  }, [ws.lastMessage, onMatchFound]);

  const findMatch = useCallback(() => {
    ws.send({ type: 'JOIN_QUEUE', wagerAmount: selected });
  }, [ws, selected]);

  const cancelSearch = useCallback(() => {
    ws.send({ type: 'LEAVE_QUEUE' });
  }, [ws]);

  const createChallenge = useCallback(() => {
    ws.send({ type: 'CREATE_CHALLENGE', wagerAmount: selected });
  }, [ws, selected]);

  const cancelChallenge = useCallback(() => {
    ws.send({ type: 'CANCEL_CHALLENGE' });
  }, [ws]);

  const joinChallenge = useCallback(() => {
    if (challengeInput.length !== 6) return;
    ws.send({ type: 'JOIN_CHALLENGE', challengeCode: challengeInput.toUpperCase() });
    setState({ kind: 'joining_challenge' });
  }, [ws, challengeInput]);

  // ─── Found state ────────────────────────────────────────────────────
  if (state.kind === 'found') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
        <p className="text-lg text-slate-500 tracking-widest uppercase">Opponent Found</p>
        <p className="text-3xl font-extrabold text-cyan-400">{state.opponentName}</p>
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center h-full px-6 pt-12 gap-6">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${ws.connected ? 'bg-green-400' : 'bg-red-400'}`} />
        <p className="text-xs text-slate-500">
          {ws.connected ? `Connected as ${ws.displayName}` : 'Connecting...'}
        </p>
      </div>

      {/* Back button */}
      <button onPointerDown={onBack} className="absolute top-4 left-4 text-slate-500 text-sm">
        &larr; Back
      </button>

      {/* Tabs */}
      <div className="flex gap-2 w-full max-w-xs">
        <button
          onPointerDown={() => setTab('quick')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === 'quick' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Quick Match
        </button>
        <button
          onPointerDown={() => setTab('challenge')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === 'challenge' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Challenge
        </button>
      </div>

      {/* Wager selector */}
      <div className="w-full max-w-xs">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 text-center">Wager Tier</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VALID_WAGER_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onPointerDown={() => setSelected(amt)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                selected === amt ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {amt} TON
            </button>
          ))}
        </div>
      </div>

      {/* Quick Match tab */}
      {tab === 'quick' && (
        <div className="w-full max-w-xs flex flex-col gap-4">
          {state.kind === 'idle' && (
            <button
              onPointerDown={findMatch}
              disabled={!ws.connected}
              className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              FIND MATCH
            </button>
          )}
          {state.kind === 'searching' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Searching for opponent...</p>
              <button
                onPointerDown={cancelSearch}
                className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold active:bg-slate-700 transition-colors"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      )}

      {/* Challenge tab */}
      {tab === 'challenge' && (
        <div className="w-full max-w-xs flex flex-col gap-4">
          {state.kind === 'idle' && (
            <>
              <button
                onPointerDown={createChallenge}
                disabled={!ws.connected}
                className="w-full py-4 rounded-xl bg-cyan-500 text-black text-lg font-extrabold tracking-wider active:bg-cyan-400 transition-colors disabled:opacity-50"
              >
                CREATE CHALLENGE
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter code"
                  value={challengeInput}
                  onChange={(e) => setChallengeInput(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-600 outline-none focus:ring-2 ring-cyan-500"
                />
                <button
                  onPointerDown={joinChallenge}
                  disabled={!ws.connected || challengeInput.length !== 6}
                  className="px-6 py-3 rounded-xl bg-cyan-500 text-black font-bold active:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  JOIN
                </button>
              </div>
            </>
          )}
          {state.kind === 'creating_challenge' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-slate-400 text-sm">Waiting for opponent...</p>
              <p className="text-4xl font-mono font-bold text-cyan-400 tracking-[0.3em]">{state.code}</p>
              <p className="text-xs text-slate-600">Share this code with your opponent</p>
              <button
                onPointerDown={cancelChallenge}
                className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold active:bg-slate-700 transition-colors"
              >
                CANCEL
              </button>
            </div>
          )}
          {state.kind === 'joining_challenge' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Joining challenge...</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {ws.error && (
        <p className="text-red-400 text-xs text-center">{ws.error}</p>
      )}
    </div>
  );
}
