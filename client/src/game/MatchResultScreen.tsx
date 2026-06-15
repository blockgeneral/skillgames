import { formatCoins } from '@skillgamez/shared';
import type { MatchState } from './types.js';
import { PLAYER_ID } from './types.js';

interface Props {
  match: MatchState;
  coinsWon: number;
  newBalance: number;
  rematchState: 'idle' | 'requesting' | 'offered' | 'declined';
  onRematch: () => void;
  onDeclineRematch: () => void;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export function MatchResultScreen({ match, coinsWon, newBalance, rematchState, onRematch, onDeclineRematch, onPlayAgain, onMainMenu }: Props): JSX.Element {
  // coinsWon is the single source of truth from the server (positive = win, negative = lose, 0 = draw)
  const won = coinsWon > 0;
  const draw = coinsWon === 0;
  const totalPlayerMs = match.roundResults.reduce((sum, rr) => sum + rr.playerATotalMs, 0);
  const totalOpponentMs = match.roundResults.reduce((sum, rr) => sum + rr.playerBTotalMs, 0);

  // Stats across all prompts
  const allPlayerResults = match.playerResults.flat();
  const hitResults = allPlayerResults.filter(r => r.hit && r.reactionMs !== null);
  const avgMs = hitResults.length > 0
    ? Math.round(hitResults.reduce((sum, r) => sum + r.reactionMs!, 0) / hitResults.length)
    : null;
  const bestMs = hitResults.length > 0
    ? Math.min(...hitResults.map(r => r.reactionMs!))
    : null;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 animate-fade-in overflow-y-auto">
      {/* Result header */}
      <p className={`text-5xl font-extrabold tracking-wider ${draw ? 'text-yellow-400' : won ? 'text-green-400' : 'text-red-400'}`}>
        {draw ? 'DRAW' : won ? 'YOU WIN' : 'YOU LOSE'}
      </p>

      {/* Coins won/lost */}
      {coinsWon !== 0 && (
        <p className={`text-2xl font-extrabold ${coinsWon > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {coinsWon > 0 ? '+' : ''}{formatCoins(coinsWon)}
        </p>
      )}
      {coinsWon === 0 && draw && (
        <p className="text-lg text-yellow-400 font-bold">Coins refunded</p>
      )}

      {/* New balance */}
      {newBalance > 0 && (
        <p className="text-sm text-slate-400">
          Balance: <span className="text-yellow-400 font-bold">{formatCoins(newBalance)}</span>
        </p>
      )}

      {/* Cumulative total time — the deciding stat */}
      <div className="flex gap-8 text-center">
        <div>
          <p className="text-xs text-slate-500 uppercase">Your total</p>
          <p className={`text-3xl font-mono ${won ? 'text-green-400' : draw ? 'text-yellow-400' : 'text-cyan-400'}`}>
            {totalPlayerMs.toLocaleString()}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase">Opponent</p>
          <p className={`text-3xl font-mono ${!won && !draw ? 'text-green-400' : 'text-red-400'}`}>
            {totalOpponentMs.toLocaleString()}ms
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-center">
        {avgMs !== null && (
          <div>
            <p className="text-xs text-slate-500 uppercase">Avg reaction</p>
            <p className="text-lg font-mono text-slate-300">{avgMs}ms</p>
          </div>
        )}
        {bestMs !== null && (
          <div>
            <p className="text-xs text-slate-500 uppercase">Best</p>
            <p className="text-lg font-mono text-green-400">{bestMs}ms</p>
          </div>
        )}
      </div>

      {/* Per-round breakdown */}
      <div className="w-full max-w-xs space-y-2">
        {match.roundResults.map((rr, i) => {
          const playerWon = rr.winnerId === PLAYER_ID;
          const isDraw = rr.winnerId === null;
          return (
            <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-slate-900 rounded-lg">
              <span className="text-slate-500 font-bold">R{rr.roundNumber}</span>
              <span className="font-mono text-cyan-400">{rr.playerATotalMs.toLocaleString()}ms</span>
              <span className="text-slate-600">vs</span>
              <span className="font-mono text-red-400">{rr.playerBTotalMs.toLocaleString()}ms</span>
              <span className={`font-bold ${isDraw ? 'text-yellow-400' : playerWon ? 'text-green-400' : 'text-red-400'}`}>
                {isDraw ? 'DRAW' : playerWon ? 'WIN' : 'LOSS'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rematch offer received */}
      {rematchState === 'offered' && (
        <div className="w-full max-w-xs bg-slate-800 rounded-xl p-4 text-center">
          <p className="text-sm text-cyan-400 font-bold mb-3">Opponent wants a rematch!</p>
          <div className="flex gap-3">
            <button
              onPointerDown={onRematch}
              className="flex-1 py-3 rounded-xl bg-green-500 text-black text-sm font-extrabold active:bg-green-400 transition-colors"
            >
              ACCEPT
            </button>
            <button
              onPointerDown={onDeclineRematch}
              className="flex-1 py-3 rounded-xl bg-slate-700 text-slate-300 text-sm font-bold active:bg-slate-600 transition-colors"
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="w-full max-w-xs flex flex-col gap-3 mt-2">
        {rematchState !== 'offered' && (
          <button
            onPointerDown={onRematch}
            disabled={rematchState === 'requesting'}
            className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors disabled:opacity-50"
          >
            {rematchState === 'requesting' ? 'WAITING FOR OPPONENT...' : 'REMATCH'}
          </button>
        )}
        {rematchState === 'declined' && (
          <p className="text-sm text-red-400 text-center">Opponent declined</p>
        )}
        <button
          onPointerDown={onPlayAgain}
          className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold tracking-wider active:bg-slate-700 transition-colors"
        >
          PLAY AGAIN
        </button>
        <button
          onPointerDown={onMainMenu}
          className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold tracking-wider active:bg-slate-700 transition-colors"
        >
          MAIN MENU
        </button>
      </div>
    </div>
  );
}
