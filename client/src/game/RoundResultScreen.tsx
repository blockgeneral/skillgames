import type { RoundOutcome } from './types.js';

interface Props {
  roundNumber: number;
  outcome: RoundOutcome;
  score: [number, number];
}

export function RoundResultScreen({ roundNumber: _roundNumber, outcome, score }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
      {outcome.type === 'hit' && outcome.youWon && (
        <>
          <p className="text-4xl font-extrabold text-green-400">HIT</p>
          <p className="text-6xl font-mono text-green-300">{outcome.reactionMs}ms</p>
        </>
      )}
      {outcome.type === 'hit' && !outcome.youWon && (
        <>
          <p className="text-4xl font-extrabold text-red-400">HIT - TOO SLOW</p>
          <p className="text-6xl font-mono text-red-300">{outcome.reactionMs}ms</p>
        </>
      )}
      {outcome.type === 'miss' && (
        <p className="text-4xl font-extrabold text-red-400">MISS</p>
      )}
      {outcome.type === 'false-start' && (
        <p className="text-4xl font-extrabold text-red-400">FALSE START</p>
      )}
      {outcome.type === 'too-slow' && (
        <p className="text-4xl font-extrabold text-red-400">TOO SLOW</p>
      )}
      {outcome.type === 'draw' && (
        <>
          <p className="text-4xl font-extrabold text-yellow-400">DRAW</p>
          <p className="text-6xl font-mono text-yellow-300">{outcome.reactionMs}ms</p>
        </>
      )}

      {/* Times comparison */}
      {(outcome.type === 'hit' || outcome.type === 'miss' || outcome.type === 'too-slow' || outcome.type === 'draw') && (
        <div className="text-sm text-slate-400 text-center">
          <p>
            You: <span className="text-slate-200 font-mono">
              {outcome.type === 'hit' ? `${outcome.reactionMs}ms` : outcome.type === 'draw' ? `${outcome.reactionMs}ms` : '---'}
            </span>
            {' / '}
            Opponent: <span className="text-slate-200 font-mono">{outcome.opponentMs}ms</span>
          </p>
        </div>
      )}

      {/* Score */}
      <div className="animate-score-pop">
        <p className="text-3xl font-extrabold text-slate-200">
          <span className="text-cyan-400">{score[0]}</span>
          <span className="text-slate-600 mx-3">-</span>
          <span className="text-red-400">{score[1]}</span>
        </p>
      </div>
    </div>
  );
}
