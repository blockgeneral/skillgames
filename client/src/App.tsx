import { useState, useEffect, useCallback } from 'react';
import { useGame } from './game/useGame.js';
import { StartScreen } from './game/StartScreen.js';
import { GetReadyScreen } from './game/GetReadyScreen.js';
import { DelayScreen } from './game/DelayScreen.js';
import { PromptScreen } from './game/PromptScreen.js';
import { RoundResultScreen } from './game/RoundResultScreen.js';
import { MatchResultScreen } from './game/MatchResultScreen.js';
import { DebugOverlay } from './game/DebugOverlay.js';

export function App(): JSX.Element {
  const { phase, match, debugInfo, startMatch, handleTap, resetToStart } = useGame();
  const [showDebug, setShowDebug] = useState(false);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'd' || e.key === 'D') {
      setShowDebug((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  // Prevent context menu on long-press
  useEffect(() => {
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      {showDebug && <DebugOverlay info={debugInfo} />}

      {phase.kind === 'start' && <StartScreen onPlay={startMatch} />}

      {phase.kind === 'get-ready' && <GetReadyScreen roundNumber={phase.roundNumber} />}

      {phase.kind === 'delay' && (
        <DelayScreen
          onFalseStart={(timestamp) => handleTap(0, 0, timestamp, true)}
        />
      )}

      {phase.kind === 'prompted' && match && (
        <PromptScreen
          prompt={match.rounds[match.currentRound]!.prompt}
          onTap={handleTap}
        />
      )}

      {phase.kind === 'round-result' && match && (
        <RoundResultScreen
          roundNumber={phase.roundNumber}
          outcome={phase.outcome}
          score={match.score}
        />
      )}

      {phase.kind === 'match-result' && match && (
        <MatchResultScreen match={match} onPlayAgain={resetToStart} />
      )}
    </div>
  );
}
