interface Props {
  onPlayOnline: () => void;
  onPractice: () => void;
  onTutorial: () => void;
}

export function StartScreen({ onPlayOnline, onPractice, onTutorial }: Props): JSX.Element {
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

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onPointerDown={onPlayOnline}
          className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors"
        >
          PLAY ONLINE
        </button>
        <button
          onPointerDown={onPractice}
          className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold tracking-wider active:bg-slate-700 transition-colors"
        >
          PRACTICE
        </button>
        <button
          onPointerDown={onTutorial}
          className="w-full py-3 rounded-xl bg-slate-800/50 text-slate-500 text-xs font-bold tracking-wider active:bg-slate-700 transition-colors"
        >
          HOW TO PLAY
        </button>
      </div>
    </div>
  );
}
