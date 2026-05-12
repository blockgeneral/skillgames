import { useState, useEffect, useCallback } from 'react';
import { useGame } from './game/useGame.js';
import { StartScreen } from './game/StartScreen.js';
import { TutorialScreen } from './game/TutorialScreen.js';
import { CountdownScreen } from './game/CountdownScreen.js';
import { RoundHeaderScreen } from './game/RoundHeaderScreen.js';
import { GameplayScreen } from './game/GameplayScreen.js';
import { RoundResultScreen } from './game/RoundResultScreen.js';
import { MatchResultScreen } from './game/MatchResultScreen.js';
import { DebugOverlay } from './game/DebugOverlay.js';

export function App(): JSX.Element {
  const {
    phase, match, debugInfo, currentMissCount, startMatch,
    openTutorial, completeTutorial, handleInput, resetToStart,
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

  const renderPhase = () => {
    switch (phase.kind) {
      case 'start':
        return <StartScreen onPlay={startMatch} onTutorial={openTutorial} />;
      case 'tutorial':
        return <TutorialScreen onComplete={completeTutorial} />;
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
        return <MatchResultScreen match={match} onPlayAgain={startMatch} onMainMenu={resetToStart} />;
    }
  };

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      {showDebug && <DebugOverlay info={debugInfo} />}
      {renderPhase()}
    </div>
  );
}
