import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import type { Difficulty } from '@skillgames/shared';

/**
 * Props for the HomeScreen component.
 */
export interface HomeScreenProps {
  onStartGame: (difficulty: Difficulty) => void;
}

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string; size: string }> = [
  { value: 'easy', label: 'Easy', size: '10x10' },
  { value: 'medium', label: 'Medium', size: '15x15' },
  { value: 'hard', label: 'Hard', size: '20x20' },
];

/**
 * Home screen with title, difficulty selector, and play button.
 */
export function HomeScreen({ onStartGame }: HomeScreenProps): JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const handlePlay = (): void => {
    onStartGame(difficulty);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Maze Paint</h1>
        <p style={styles.subtitle}>Paint the maze before time runs out!</p>

        <div style={styles.difficultySection}>
          <p style={styles.label}>Difficulty</p>
          <div style={styles.buttonGroup}>
            {DIFFICULTY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDifficulty(opt.value)}
                style={{
                  ...styles.difficultyButton,
                  ...(difficulty === opt.value ? styles.difficultyButtonSelected : {}),
                }}
              >
                <span style={styles.difficultyLabel}>{opt.label}</span>
                <span style={styles.difficultySize}>{opt.size}</span>
              </button>
            ))}
          </div>
        </div>

        <Button
          size="l"
          stretched
          onClick={handlePlay}
          style={styles.playButton}
        >
          Play
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
    gap: '24px',
    maxWidth: '400px',
    width: '100%',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--tgui--text_color, #ffffff)',
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '16px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
    margin: 0,
    textAlign: 'center',
  },
  difficultySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  label: {
    fontSize: '14px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
    margin: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  difficultyButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 8px',
    border: '2px solid var(--tgui--hint_color, #444)',
    borderRadius: '12px',
    backgroundColor: 'var(--tgui--secondary_bg_color, #212121)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  difficultyButtonSelected: {
    borderColor: 'var(--tgui--accent_text_color, #8774e1)',
    backgroundColor: 'rgba(135, 116, 225, 0.15)',
  },
  difficultyLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--tgui--text_color, #ffffff)',
  },
  difficultySize: {
    fontSize: '12px',
    color: 'var(--tgui--hint_color, #aaaaaa)',
  },
  playButton: {
    marginTop: '16px',
  },
};
