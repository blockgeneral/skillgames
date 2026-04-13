import type { GameState } from '../state/gameReducer.js';

/**
 * Props for the ResultScreen component.
 */
export interface ResultScreenProps {
  state: GameState;
  onPlayAgain: () => void;
  onSameMaze: () => void;
}

/**
 * Result screen showing win/timeout message and final stats.
 */
export function ResultScreen({
  state,
  onPlayAgain,
  onSameMaze,
}: ResultScreenProps): JSX.Element {
  const won = state.status === 'won';

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5 bg-slate-900">
      <div className="flex flex-col items-center gap-4 max-w-md w-full">
        {/* Result icon */}
        <div className="text-6xl mb-2">{won ? '🎉' : '⏰'}</div>

        {/* Result message */}
        <h1
          className={`text-3xl font-bold text-center ${
            won ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {won ? 'You Won!' : 'Time Ran Out!'}
        </h1>

        <p className="text-base text-slate-400 text-center">
          {won ? 'You painted the entire maze!' : 'Better luck next time!'}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 w-full mt-4 p-5 bg-slate-800 rounded-xl">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-400">Time</span>
            <span className="text-xl font-semibold text-white">
              {formatTime(state.elapsedSeconds)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-400">Progress</span>
            <span className="text-xl font-semibold text-white">
              {state.progress.toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-400">Moves</span>
            <span className="text-xl font-semibold text-white">
              {state.mazeState.moveCount}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-400">Difficulty</span>
            <span className="text-xl font-semibold text-white capitalize">
              {state.difficulty}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 w-full mt-4">
          <button
            onClick={onSameMaze}
            className="
              w-full py-4 px-6 rounded-xl
              bg-slate-700 hover:bg-slate-600 active:bg-slate-500
              text-white font-bold text-lg
              transition-colors
            "
          >
            Same Maze
          </button>
          <button
            onClick={onPlayAgain}
            className="
              w-full py-4 px-6 rounded-xl
              bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600
              text-white font-bold text-lg
              transition-colors
            "
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
