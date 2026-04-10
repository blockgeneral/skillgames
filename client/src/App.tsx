import { useReducer, useCallback, useState } from 'react';
import { AppRoot } from '@telegram-apps/telegram-ui';
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

  const handlePlayAgain = useCallback((): void => {
    setScreen('home');
  }, []);

  // Transition to result screen when game ends
  if (screen === 'game' && gameState.status !== 'playing') {
    setScreen('result');
  }

  return (
    <AppRoot>
      {screen === 'home' && (
        <HomeScreen onStartGame={handleStartGame} />
      )}
      {screen === 'game' && (
        <GameScreen
          state={gameState}
          onMove={handleMove}
          onTick={handleTick}
        />
      )}
      {screen === 'result' && (
        <ResultScreen
          state={gameState}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </AppRoot>
  );
}
