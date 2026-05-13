interface Props {
  opponentName: string;
  wagerAmount: number;
  waitingForOpponent: boolean;
  onReady: () => void;
}

export function ReadyScreen({ opponentName, wagerAmount, waitingForOpponent, onReady }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-6 animate-fade-in">
      <p className="text-lg text-slate-500 tracking-widest uppercase">Match Found</p>

      <div className="text-center">
        <p className="text-sm text-slate-500">vs</p>
        <p className="text-3xl font-extrabold text-cyan-400 mt-1">{opponentName}</p>
        <p className="text-sm text-slate-600 mt-2">{wagerAmount} TON</p>
      </div>

      {!waitingForOpponent ? (
        <button
          onPointerDown={onReady}
          className="w-full max-w-xs py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors"
        >
          READY
        </button>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Waiting for opponent...</p>
        </div>
      )}
    </div>
  );
}
