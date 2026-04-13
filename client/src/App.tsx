import { useReducer, useCallback, useState, useEffect } from 'react';
import type { Difficulty } from '@skillgames/shared';
import { HomeScreen } from './screens/HomeScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { ResultScreen } from './screens/ResultScreen.js';
import {
  gameReducer,
  createGameState,
  type Direction,
} from './state/gameReducer.js';

/**
 * Screen states for navigation.
 */
type Screen = 'home' | 'game' | 'result';

/**
 * Main application component.
 * Manages screen navigation and game state.
 */
export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [gameState, dispatch] = useReducer(gameReducer, createGameState('medium'));

  const handleStartGame = useCallback((difficulty: Difficulty): void => {
    dispatch({ type: 'RESET', difficulty });
    setScreen('game');
  }, []);

  const handleMove = useCallback((direction: Direction): void => {
    dispatch({ type: 'MOVE', direction });
  }, []);

  const handleTick = useCallback((): void => {
    dispatch({ type: 'TICK' });
  }, []);

  const handleTogglePause = useCallback((): void => {
    dispatch({ type: 'TOGGLE_PAUSE' });
  }, []);

  const handlePlayAgain = useCallback((): void => {
    setScreen('home');
  }, []);

  const handleSameMaze = useCallback((): void => {
    dispatch({ type: 'RESET_SAME_MAZE' });
    setScreen('game');
  }, []);

  // Transition to result screen when game ends
  useEffect(() => {
    if (screen === 'game' && gameState.status !== 'playing') {
      setScreen('result');
    }
  }, [screen, gameState.status]);

  return (
    <>
      {screen === 'home' && <HomeScreen onStartGame={handleStartGame} />}
      {screen === 'game' && (
        <GameScreen
          state={gameState}
          onMove={handleMove}
          onTick={handleTick}
          onTogglePause={handleTogglePause}
        />
      )}
      {screen === 'result' && (
        <ResultScreen
          state={gameState}
          onPlayAgain={handlePlayAgain}
          onSameMaze={handleSameMaze}
        />
      )}
    </>
  );
}
