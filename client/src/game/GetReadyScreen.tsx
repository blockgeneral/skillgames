interface Props {
  roundNumber: number;
}

export function GetReadyScreen({ roundNumber }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
      <p className="text-lg text-slate-500 tracking-widest uppercase">Round</p>
      <p className="text-7xl font-extrabold text-cyan-400 mt-1">{roundNumber}</p>
      <p className="text-sm text-slate-600 mt-4">of 5</p>
    </div>
  );
}
