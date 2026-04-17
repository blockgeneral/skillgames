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
import type { BallEffectId, BackgroundEffectId } from './components/effects/types.js';

type Screen = 'home' | 'game' | 'result';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [gameState, dispatch] = useReducer(gameReducer, createGameState('medium'));
  const [ballEffect, setBallEffect] = useState<BallEffectId>('none');
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundEffectId>('none');

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

  // Transition to result screen when game ends.
  useEffect(() => {
    if (screen !== 'game' || gameState.status === 'playing') return;

    if (gameState.status === 'timeout') {
      setScreen('result');
      return;
    }

    const pathLen = gameState.lastSlidePath?.length ?? 0;
    const slideMs = Math.max(0, (pathLen - 1) * 40) + 200;
    const timer = setTimeout(() => setScreen('result'), slideMs);
    return () => clearTimeout(timer);
  }, [screen, gameState.status, gameState.lastSlidePath]);

  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          onStartGame={handleStartGame}
          ballEffect={ballEffect}
          backgroundEffect={backgroundEffect}
          onBallEffectChange={setBallEffect}
          onBackgroundEffectChange={setBackgroundEffect}
        />
      )}
      {screen === 'game' && (
        <GameScreen
          state={gameState}
          onMove={handleMove}
          onTick={handleTick}
          onTogglePause={handleTogglePause}
          ballEffect={ballEffect}
          backgroundEffect={backgroundEffect}
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
