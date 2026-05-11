import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';

interface Props {
  roundIndex: number;
  score: [number, number];
}

export function RoundHeaderScreen({ roundIndex, score }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
      <p className="text-lg text-slate-500 tracking-widest uppercase">Round</p>
      <p className="text-7xl font-extrabold text-cyan-400 mt-1">{roundIndex + 1}</p>
      <p className="text-sm text-slate-600 mt-4">of {QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH}</p>
      {roundIndex > 0 && (
        <p className="text-2xl font-extrabold text-slate-300 mt-6">
          <span className="text-cyan-400">{score[0]}</span>
          <span className="text-slate-600 mx-2">-</span>
          <span className="text-red-400">{score[1]}</span>
        </p>
      )}
    </div>
  );
}
