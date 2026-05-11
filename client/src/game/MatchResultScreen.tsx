import type { MatchState } from './types.js';
import { PLAYER_ID } from './types.js';
import type { WagerAmount } from '@skillgamez/shared';

interface Props {
  match: MatchState;
  onPlayAgain: (wagerAmount: WagerAmount) => void;
  onMainMenu: () => void;
}

export function MatchResultScreen({ match, onPlayAgain, onMainMenu }: Props): JSX.Element {
  const [you, opp] = match.score;
  const won = you > opp;
  const draw = you === opp;

  // Compute stats across all rounds
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

      {/* Score */}
      <p className="text-4xl font-extrabold text-slate-200">
        <span className="text-cyan-400">{you}</span>
        <span className="text-slate-600 mx-3">-</span>
        <span className="text-red-400">{opp}</span>
      </p>

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

      {/* Buttons */}
      <div className="w-full max-w-xs flex flex-col gap-3 mt-2">
        <button
          onPointerDown={() => onPlayAgain(match.wagerAmount)}
          className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors"
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
