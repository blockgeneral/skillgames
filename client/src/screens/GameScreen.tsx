import { useEffect, useRef, useCallback, useState } from 'react';
import { MazeRenderer } from '../components/MazeRenderer.js';
import type { GameState, Direction } from '../state/gameReducer.js';

/**
 * Props for the GameScreen component.
 */
export interface GameScreenProps {
  state: GameState;
  onMove: (direction: Direction) => void;
  onTick: () => void;
  onTogglePause: () => void;
}

/**
 * Converts a key code to a direction.
 */
function keyToDirection(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return null;
  }
}

/**
 * Minimum swipe distance in pixels to register as a swipe.
 */
const MIN_SWIPE_DISTANCE = 30;

/**
 * Input throttle duration in milliseconds.
 */
const INPUT_THROTTLE_MS = 50;

/**
 * Game screen showing the maze, progress, and timer.
 * Handles keyboard and touch input with 50ms throttling.
 */
export function GameScreen({
  state,
  onMove,
  onTick,
  onTogglePause,
}: GameScreenProps): JSX.Element {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveTimeRef = useRef<number>(0);
  const [mazeSize, setMazeSize] = useState(0);

  // Calculate maze size based on viewport
  const calculateMazeSize = useCallback((): number => {
    const padding = 32;
    const headerHeight = 80;
    const footerHeight = 120;
    const maxWidth = window.innerWidth - padding;
    const maxHeight = window.innerHeight - headerHeight - footerHeight - padding;
    return Math.min(maxWidth, maxHeight, Math.min(window.innerWidth, window.innerHeight) * 0.9);
  }, []);

  // Initialize and update maze size on resize
  useEffect(() => {
    setMazeSize(calculateMazeSize());
    const handleResize = (): void => {
      setMazeSize(calculateMazeSize());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateMazeSize]);

  // Throttled move handler
  const handleThrottledMove = useCallback(
    (direction: Direction): void => {
      const now = Date.now();
      if (now - lastMoveTimeRef.current < INPUT_THROTTLE_MS) {
        return;
      }
      lastMoveTimeRef.current = now;
      onMove(direction);
    },
    [onMove]
  );

  // Keyboard input handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape to pause
      if (e.key === 'Escape') {
        e.preventDefault();
        onTogglePause();
        return;
      }

      const direction = keyToDirection(e.key);
      if (direction) {
        e.preventDefault();
        handleThrottledMove(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleThrottledMove, onTogglePause]);

  // Touch input handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent): void => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent): void => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Determine swipe direction
      if (Math.max(absDx, absDy) >= MIN_SWIPE_DISTANCE) {
        let direction: Direction;
        if (absDx > absDy) {
          direction = dx > 0 ? 'right' : 'left';
        } else {
          direction = dy > 0 ? 'down' : 'up';
        }
        handleThrottledMove(direction);
      }

      touchStartRef.current = null;
    },
    [handleThrottledMove]
  );

  // Timer tick
  useEffect(() => {
    if (state.status !== 'playing' || state.paused) return;

    const interval = setInterval(() => {
      onTick();
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, state.paused, onTick]);

  // Format time remaining
  const timeRemaining = state.maxSeconds - state.elapsedSeconds;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Direction button handler
  const handleDirectionClick = (direction: Direction) => (): void => {
    handleThrottledMove(direction);
  };

  return (
    <div
      className="flex flex-col items-center min-h-screen p-3 bg-slate-900 select-none"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header with timer and progress */}
      <div className="flex justify-between items-center w-full max-w-md mb-3 gap-4">
        <div className="flex flex-col items-start">
          <span className="text-xs text-slate-400">Time</span>
          <span
            className={`text-2xl font-bold tabular-nums ${
              timeRemaining <= 10 ? 'text-red-400' : 'text-white'
            }`}
          >
            {timeDisplay}
          </span>
        </div>

        <button
          onClick={onTogglePause}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors"
        >
          {state.paused ? 'Resume' : 'Pause'}
        </button>

        <div className="flex flex-col items-end flex-1 max-w-32">
          <span className="text-xs text-slate-400">Progress</span>
          <div className="w-full h-2 bg-slate-700 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-emerald-400 tabular-nums mt-0.5">
            {state.progress.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Maze */}
      <div className="flex justify-center items-center flex-1 relative">
        {mazeSize > 0 && (
          <MazeRenderer state={state.mazeState} size={mazeSize} />
        )}

        {/* Pause overlay */}
        {state.paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl">
            <span className="text-2xl font-bold text-white">Paused</span>
          </div>
        )}
      </div>

      {/* Direction buttons */}
      <div className="grid grid-cols-3 gap-2 mt-4 w-36">
        <div /> {/* Empty cell */}
        <button
          onClick={handleDirectionClick('up')}
          className="p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl transition-colors"
          aria-label="Move up"
        >
          <svg
            className="w-6 h-6 mx-auto text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
        </button>
        <div /> {/* Empty cell */}

        <button
          onClick={handleDirectionClick('left')}
          className="p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl transition-colors"
          aria-label="Move left"
        >
          <svg
            className="w-6 h-6 mx-auto text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={handleDirectionClick('down')}
          className="p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl transition-colors"
          aria-label="Move down"
        >
          <svg
            className="w-6 h-6 mx-auto text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        <button
          onClick={handleDirectionClick('right')}
          className="p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl transition-colors"
          aria-label="Move right"
        >
          <svg
            className="w-6 h-6 mx-auto text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Controls hint */}
      <p className="text-xs text-slate-500 mt-3 text-center">
        Arrow keys / WASD / Swipe to move
      </p>
    </div>
  );
}
