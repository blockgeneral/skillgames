import { Button } from '@telegram-apps/telegram-ui';
import type { GameState } from '../state/gameReducer.js';

/**
 * Props for the ResultScreen component.
 */
export interface ResultScreenProps {
  state: GameState;
  onPlayAgain: () => void;
}

/**
 * Result screen showing win/timeout message and final stats.
 */
export function ResultScreen({ state, onPlayAgain }: ResultScreenProps): JSX.Element {
  const won = state.status === 'won';

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Result icon */}
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{won ? '🎉' : '⏰'}</span>
        </div>

        {/* Result message */}
        <h1 style={won ? styles.titleWon : styles.titleLost}>
          {won ? 'You Won!' : 'Time Ran Out!'}
        </h1>

        {won ? (
          <p style={styles.subtitle}>
            You painted the entire maze!
          </p>
        ) : (
          <p style={styles.subtitle}>
            Better luck next time!
          </p>
        )}

        {/* Stats */}
        <div style={styles.statsContainer}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Time</span>
            <span style={styles.statValue}>{formatTime(state.elapsedSeconds)}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Progress</span>
            <span style={styles.statValue}>{state.progress.toFixed(1)}%</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Moves</span>
            <span style={styles.statValue}>{state.mazeState.moveCount}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Difficulty</span>
            <span style={styles.statValue}>
              {state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1)}
            </span>
          </div>
        </div>

        {/* Play again button */}
        <Button
          size="l"
          stretched
          onClick={onPlayAgain}
          style={styles.playButton}
        >
          Play Again
        </Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: 'var(--tgui--bg_color, #181818)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    maxWidth: '400px',
    width: '100%',
  },
  iconContainer: {
    marginBottom: '8px',
  },
  icon: {
    fontSize: '64px',
  },
  titleWon: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#50c878',
    margin: 0,
    textAlign: 'center',
  },
  titleLost: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#ff6b6b',
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '16px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
    margin: 0,
    textAlign: 'center',
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    width: '100%',
    marginTop: '16px',
    padding: '20px',
    backgroundColor: 'var(--tgui--secondary_bg_color, #212121)',
    borderRadius: '12px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--tgui--text_color, #ffffff)',
  },
  playButton: {
    marginTop: '24px',
  },
};
