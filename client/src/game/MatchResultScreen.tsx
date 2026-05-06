import type { MatchState, RoundOutcome } from './types.js';

interface Props {
  match: MatchState;
  onPlayAgain: () => void;
}

function avgReactionTime(times: (number | null)[]): number | null {
  const valid = times.filter((t): t is number => t !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function outcomeLabel(o: RoundOutcome): string {
  switch (o.type) {
    case 'hit':
      return o.youWon ? `HIT ${o.reactionMs}ms` : `HIT ${o.reactionMs}ms (lost)`;
    case 'miss':
      return 'MISS';
    case 'false-start':
      return 'FALSE START';
    case 'too-slow':
      return 'TOO SLOW';
    case 'draw':
      return `DRAW ${o.reactionMs}ms`;
  }
}

export function MatchResultScreen({ match, onPlayAgain }: Props): JSX.Element {
  const [you, opp] = match.score;
  const won = you > opp;
  const draw = you === opp;

  const avgPlayer = avgReactionTime(match.playerReactionTimes);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6 animate-fade-in">
      {/* Result header */}
      <p
        className={`text-5xl font-extrabold tracking-wider ${
          draw ? 'text-yellow-400' : won ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {draw ? 'DRAW' : won ? 'YOU WIN' : 'YOU LOSE'}
      </p>

      {/* Score */}
      <p className="text-4xl font-extrabold text-slate-200">
        <span className="text-cyan-400">{you}</span>
        <span className="text-slate-600 mx-3">-</span>
        <span className="text-red-400">{opp}</span>
      </p>

      {/* Avg reaction time */}
      {avgPlayer !== null && (
        <p className="text-sm text-slate-500">
          Avg reaction: <span className="text-slate-300 font-mono">{avgPlayer}ms</span>
        </p>
      )}

      {/* Round breakdown */}
      <div className="w-full max-w-xs space-y-1">
        {match.roundOutcomes.map((o, i) => (
          <div
            key={i}
            className="flex justify-between text-xs text-slate-500 px-2 py-1 bg-slate-900 rounded"
          >
            <span>R{i + 1}</span>
            <span className="font-mono text-slate-400">{outcomeLabel(o)}</span>
            <span className="font-mono text-slate-600">
              opp: {o.type !== 'false-start' ? `${o.opponentMs}ms` : '---'}
            </span>
          </div>
        ))}
      </div>

      {/* Play again */}
      <button
        onPointerDown={onPlayAgain}
        className="w-full max-w-xs py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors mt-4"
      >
        PLAY AGAIN
      </button>
    </div>
  );
}
