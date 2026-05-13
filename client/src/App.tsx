import { useState, useEffect, useCallback } from 'react';
import type { MatchId, PlayerInfo, WagerAmount } from '@skillgamez/shared';
import { useGame } from './game/useGame.js';
import { useWebSocket } from './ws/useWebSocket.js';
import { StartScreen } from './game/StartScreen.js';
import { TutorialScreen } from './game/TutorialScreen.js';
import { CountdownScreen } from './game/CountdownScreen.js';
import { RoundHeaderScreen } from './game/RoundHeaderScreen.js';
import { GameplayScreen } from './game/GameplayScreen.js';
import { RoundResultScreen } from './game/RoundResultScreen.js';
import { MatchResultScreen } from './game/MatchResultScreen.js';
import { DebugOverlay } from './game/DebugOverlay.js';
import { LobbyScreen } from './lobby/LobbyScreen.js';

type AppScreen = 'start' | 'tutorial' | 'lobby' | 'game';

// Mock user — will be replaced with real Telegram auth
let mockUserId = Math.floor(Math.random() * 100000);
const mockUserName = `Player${mockUserId}`;

export function App(): JSX.Element {
  const [screen, setScreen] = useState<AppScreen>('start');
  const ws = useWebSocket();

  const {
    phase, match, debugInfo, currentMissCount,
    startMatch, completeTutorial, handleInput, resetToStart,
  } = useGame();
  const [showDebug, setShowDebug] = useState(false);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'd' || e.key === 'D') setShowDebug(v => !v);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  useEffect(() => {
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // Connect to server when entering lobby
  useEffect(() => {
    if (screen === 'lobby' && !ws.connected) {
      ws.connect(mockUserId, mockUserName);
    }
  }, [screen, ws]);

  const handlePlay = useCallback(() => {
    setScreen('lobby');
  }, []);

  const handleTutorial = useCallback(() => {
    setScreen('tutorial');
  }, []);

  const handleTutorialComplete = useCallback(() => {
    completeTutorial();
    setScreen('start');
  }, [completeTutorial]);

  const handleMatchFound = useCallback((_matchId: MatchId, _opponent: PlayerInfo, wagerAmount: WagerAmount) => {
    // Start the local game (still single-player prototype — server game loop is Session 6)
    setScreen('game');
    startMatch(wagerAmount);
  }, [startMatch]);

  const handleBackToStart = useCallback(() => {
    ws.disconnect();
    resetToStart();
    setScreen('start');
  }, [ws, resetToStart]);

  const handleGamePlayAgain = useCallback((_wagerAmount: WagerAmount) => {
    setScreen('lobby');
    resetToStart();
  }, [resetToStart]);

  const handleGameMainMenu = useCallback(() => {
    ws.disconnect();
    resetToStart();
    setScreen('start');
  }, [ws, resetToStart]);

  // ─── Render ─────────────────────────────────────────────────────────

  if (screen === 'start') {
    return (
      <div className="w-full h-full" style={{ touchAction: 'none' }}>
        <StartScreen onPlay={handlePlay} onTutorial={handleTutorial} />
      </div>
    );
  }

  if (screen === 'tutorial') {
    return (
      <div className="w-full h-full" style={{ touchAction: 'none' }}>
        <TutorialScreen onComplete={handleTutorialComplete} />
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <div className="w-full h-full" style={{ touchAction: 'none' }}>
        <LobbyScreen ws={ws} onMatchFound={handleMatchFound} onBack={handleBackToStart} />
      </div>
    );
  }

  // Game screen
  const renderPhase = () => {
    switch (phase.kind) {
      case 'start':
        // Redirect back to lobby if game resets to start
        return null;
      case 'tutorial':
        return <TutorialScreen onComplete={handleTutorialComplete} />;
      case 'countdown':
        return <CountdownScreen value={phase.value} />;
      case 'round_header':
        return <RoundHeaderScreen roundIndex={phase.roundIndex} score={match?.score ?? [0, 0]} />;
      case 'prompt_delay':
      case 'prompt_active':
      case 'prompt_feedback': {
        if (!match) return null;
        const { roundIndex, promptIndex } = phase;
        const prompt = match.roundConfigs[roundIndex]?.prompts[promptIndex]?.prompt ?? null;
        const results = match.playerResults[roundIndex] ?? [];
        const subPhase = phase.kind === 'prompt_delay' ? 'delay' as const
          : phase.kind === 'prompt_active' ? 'active' as const
          : 'feedback' as const;
        return (
          <GameplayScreen
            promptIndex={promptIndex}
            subPhase={subPhase}
            prompt={prompt}
            feedbackType={phase.kind === 'prompt_feedback' ? phase.feedbackType : undefined}
            results={results}
            currentMissCount={currentMissCount}
            onInput={handleInput}
            tapPosition={phase.kind === 'prompt_feedback' ? phase.tapPosition : undefined}
          />
        );
      }
      case 'round_result': {
        if (!match) return null;
        const roundResult = match.roundResults[phase.roundIndex];
        if (!roundResult) return null;
        return <RoundResultScreen roundResult={roundResult} score={match.score} />;
      }
      case 'match_result':
        if (!match) return null;
        return <MatchResultScreen match={match} onPlayAgain={handleGamePlayAgain} onMainMenu={handleGameMainMenu} />;
    }
  };

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      {showDebug && <DebugOverlay info={debugInfo} />}
      {renderPhase()}
    </div>
  );
}
