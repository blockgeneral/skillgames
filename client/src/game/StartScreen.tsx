import { useState } from 'react';
import type { WagerAmount } from '@skillgamez/shared';
import { VALID_WAGER_AMOUNTS } from '@skillgamez/shared';

interface Props {
  onPlay: (wagerAmount: WagerAmount) => void;
  onTutorial: () => void;
}

export function StartScreen({ onPlay, onTutorial }: Props): JSX.Element {
  const [selected, setSelected] = useState<WagerAmount>(1);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-6">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-widest text-cyan-400">
          QUICK DRAW
        </h1>
        <p className="mt-2 text-sm text-slate-500 tracking-wide uppercase">
          Tap fast. Hit the target.
        </p>
      </div>

      <div className="w-full max-w-xs">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 text-center">
          Wager Tier
        </p>
        <div className="grid grid-cols-3 gap-2">
          {VALID_WAGER_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onPointerDown={() => setSelected(amt)}
              className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                selected === amt
                  ? 'bg-cyan-500 text-black'
                  : 'bg-slate-800 text-slate-400 active:bg-slate-700'
              }`}
            >
              {amt} TON
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onPointerDown={() => onPlay(selected)}
          className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors"
        >
          PLAY
        </button>
        <button
          onPointerDown={onTutorial}
          className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold tracking-wider active:bg-slate-700 transition-colors"
        >
          HOW TO PLAY
        </button>
      </div>
    </div>
  );
}
