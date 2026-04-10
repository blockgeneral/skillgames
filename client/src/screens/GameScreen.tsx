import { useEffect, useRef, useCallback } from 'react';
import { Progress } from '@telegram-apps/telegram-ui';
import { MazeRenderer } from '../components/MazeRenderer.js';
import type { GameState, Direction } from '../state/gameReducer.js';

/**
 * Props for the GameScreen component.
 */
export interface GameScreenProps {
  state: GameState;
  onMove: (direction: Direction) => void;
  onTick: () => void;
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
 * Game screen showing the maze, progress, and timer.
 * Handles keyboard and touch input.
 */
export function GameScreen({ state, onMove, onTick }: GameScreenProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Calculate maze size based on viewport
  const getMazeSize = useCallback((): number => {
    const padding = 40;
    const headerHeight = 80;
    const maxWidth = window.innerWidth - padding;
    const maxHeight = window.innerHeight - headerHeight - padding;
    return Math.min(maxWidth, maxHeight);
  }, []);

  const mazeSizeRef = useRef(getMazeSize());

  // Update maze size on resize
  useEffect(() => {
    const handleResize = (): void => {
      mazeSizeRef.current = getMazeSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getMazeSize]);

  // Keyboard input handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const direction = keyToDirection(e.key);
      if (direction) {
        e.preventDefault();
        onMove(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMove]);

  // Touch input handlers
  const handleTouchStart = useCallback((e: React.TouchEvent): void => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent): void => {
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
      onMove(direction);
    }

    touchStartRef.current = null;
  }, [onMove]);

  // Timer tick
  useEffect(() => {
    if (state.status !== 'playing') return;

    const interval = setInterval(() => {
      onTick();
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, onTick]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeRemaining = state.maxSeconds - state.elapsedSeconds;

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header with timer and progress */}
      <div style={styles.header}>
        <div style={styles.timerContainer}>
          <span style={styles.timerLabel}>Time</span>
          <span style={styles.timer}>{formatTime(state.elapsedSeconds)}</span>
          <span style={styles.timerRemaining}>({formatTime(timeRemaining)} left)</span>
        </div>
        <div style={styles.progressContainer}>
          <span style={styles.progressLabel}>Progress</span>
          <Progress value={state.progress} style={styles.progressBar} />
          <span style={styles.progressValue}>{state.progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* Maze */}
      <div style={styles.mazeContainer}>
        <MazeRenderer
          state={state.mazeState}
          size={mazeSizeRef.current}
        />
      </div>

      {/* Controls hint */}
      <div style={styles.hint}>
        Use arrow keys or swipe to move
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '12px',
    backgroundColor: 'var(--tgui--bg_color, #181818)',
    touchAction: 'none',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: '400px',
    marginBottom: '12px',
    gap: '16px',
  },
  timerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  timerLabel: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
  },
  timer: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--tgui--text_color, #ffffff)',
    fontVariantNumeric: 'tabular-nums',
  },
  timerRemaining: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    flex: 1,
    maxWidth: '200px',
  },
  progressLabel: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    margin: '4px 0',
  },
  progressValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--tgui--accent_text_color, #8774e1)',
    fontVariantNumeric: 'tabular-nums',
  },
  mazeContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  hint: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
    marginTop: '12px',
    textAlign: 'center',
  },
};
