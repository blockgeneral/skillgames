import type { PromptResult, RoundResult } from '@skillgamez/shared';
import { PLAYER_ID } from './types.js';

interface Props {
  roundResult: RoundResult;
  score: [number, number];
}

function dotColor(r: PromptResult): string {
  if (r.hit) return '#22C55E';
  if (r.falseStart) return '#F97316';
  return '#FF3B3B';
}

function dotLabel(r: PromptResult): string {
  if (r.hit && r.reactionMs !== null) return `${r.reactionMs}ms`;
  if (r.falseStart) return 'FS';
  if (r.missed) return 'MISS';
  if (r.timedOut) return 'T/O';
  return '---';
}

export function RoundResultScreen({ roundResult, score }: Props): JSX.Element {
  const playerWon = roundResult.winnerId === PLAYER_ID;
  const isDraw = roundResult.winnerId === null;
  const playerResults = roundResult.playerAResults;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 animate-fade-in">
      <p className="text-lg text-slate-500 tracking-widest uppercase">Round Complete</p>

      {/* Times — green for faster, red for slower */}
      <div className="flex gap-8 text-center">
        <div>
          <p className="text-xs text-slate-500 uppercase">You</p>
          <p className={`text-3xl font-mono ${roundResult.playerATotalMs < roundResult.playerBTotalMs ? 'text-green-400' : roundResult.playerATotalMs > roundResult.playerBTotalMs ? 'text-red-400' : 'text-slate-300'}`}>
            {roundResult.playerATotalMs.toLocaleString()}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase">Opponent</p>
          <p className={`text-3xl font-mono ${roundResult.playerBTotalMs < roundResult.playerATotalMs ? 'text-green-400' : roundResult.playerBTotalMs > roundResult.playerATotalMs ? 'text-red-400' : 'text-slate-300'}`}>
            {roundResult.playerBTotalMs.toLocaleString()}ms
          </p>
        </div>
      </div>

      {/* Prompt breakdown dots */}
      <div className="flex gap-2">
        {playerResults.map((r, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: dotColor(r) }}
            title={dotLabel(r)}
          />
        ))}
      </div>

      {/* Breakdown detail */}
      <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
        {playerResults.map((r, i) => (
          <div key={i} className="text-center" style={{ color: dotColor(r) }}>
            {dotLabel(r)}
          </div>
        ))}
      </div>

      {/* Round winner */}
      <p className={`text-2xl font-extrabold mt-2 ${isDraw ? 'text-yellow-400' : playerWon ? 'text-green-400' : 'text-red-400'}`}>
        Round {roundResult.roundNumber}: {isDraw ? 'DRAW' : playerWon ? 'YOU WIN' : 'OPPONENT WINS'}
      </p>

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
