import { useState, useEffect, useCallback, useRef } from 'react';
import type { MatchId, PlayerId, PlayerInfo, WagerAmount } from '@skillgamez/shared';
import { useGame } from './game/useGame.js';
import { useMultiplayerGame } from './game/useMultiplayerGame.js';
import { useWebSocket } from './ws/useWebSocket.js';
import { StartScreen } from './game/StartScreen.js';
import { TutorialScreen } from './game/TutorialScreen.js';
import { CountdownScreen } from './game/CountdownScreen.js';
import { RoundHeaderScreen } from './game/RoundHeaderScreen.js';
import { GameplayScreen } from './game/GameplayScreen.js';
import { RoundResultScreen } from './game/RoundResultScreen.js';
import { MatchResultScreen } from './game/MatchResultScreen.js';
import { ReadyScreen } from './game/ReadyScreen.js';
import { DebugOverlay } from './game/DebugOverlay.js';
import { LobbyScreen } from './lobby/LobbyScreen.js';

type AppScreen = 'start' | 'tutorial' | 'lobby' | 'ready' | 'multiplayer' | 'practice';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<AppScreen>('start');
  const [showDebug, setShowDebug] = useState(false);

  // Multiplayer state
  const ws = useWebSocket();
  const [matchInfo, setMatchInfo] = useState<{ matchId: MatchId; opponent: PlayerInfo; wagerAmount: WagerAmount } | null>(null);
  const [readySent, setReadySent] = useState(false);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const lastBalanceMsgRef = useRef<unknown>(null);

  // Local practice game
  const practice = useGame();

  // Multiplayer game (only active when in multiplayer screen)
  const mp = useMultiplayerGame(
    matchInfo?.matchId ?? ('' as MatchId),
    ws.playerId ?? ('' as PlayerId),
    matchInfo?.opponent ?? { id: '' as PlayerId, displayName: '', walletAddress: '' as import('@skillgamez/shared').TonAddress },
    matchInfo?.wagerAmount ?? 1,
    ws,
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'd' || e.key === 'D') setShowDebug(v => !v); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // Track balance + MATCH_FOUND at App level (survives screen transitions & rematches)
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg || msg === lastBalanceMsgRef.current) return;
    lastBalanceMsgRef.current = msg;
    if (msg.type === 'BALANCE_UPDATE') {
      setCoinBalance(msg.balance);
    } else if (msg.type === 'MATCH_FOUND') {
      setCoinBalance(msg.yourBalance);
      // Always update matchInfo from MATCH_FOUND (handles initial match + rematch)
      setMatchInfo({ matchId: msg.matchId, opponent: msg.opponent, wagerAmount: msg.wagerAmount });
      setReadySent(false);
      if (screen !== 'ready') setScreen('ready');
    } else if (msg.type === 'MATCH_RESULT') {
      setCoinBalance(msg.yourNewBalance);
    }
  }, [ws.lastMessage, screen]);

  // Connect when entering lobby
  useEffect(() => {
    if (screen === 'lobby' && !ws.connected) {
      ws.connect();
    }
  }, [screen, ws]);

  // ─── Navigation callbacks ───────────────────────────────────────────

  const goToLobby = useCallback(() => setScreen('lobby'), []);
  const goToPractice = useCallback(() => { setScreen('practice'); practice.startMatch(1); }, [practice]);
  const goToTutorial = useCallback(() => setScreen('tutorial'), []);

  const handleTutorialComplete = useCallback(() => {
    practice.completeTutorial();
    setScreen('start');
  }, [practice]);

  const handleMatchFound = useCallback((matchId: MatchId, opponent: PlayerInfo, wagerAmount: WagerAmount) => {
    setMatchInfo({ matchId, opponent, wagerAmount });
    setReadySent(false);
    setScreen('ready');
  }, []);

  const handleReady = useCallback(() => {
    if (!readySent) {
      mp.sendReady();
      setReadySent(true);
    }
  }, [mp, readySent]);

  // Transition from ready to multiplayer when countdown starts
  useEffect(() => {
    if (screen === 'ready' && mp.phase.kind === 'countdown') {
      setScreen('multiplayer');
    }
  }, [screen, mp.phase]);

  const handleBackToStart = useCallback(() => {
    ws.disconnect();
    practice.resetToStart();
    setMatchInfo(null);
    setScreen('start');
  }, [ws, practice]);

  const handleRematchAccepted = useCallback(() => {
    // MATCH_FOUND will follow from server and is handled by the App-level effect above.
    // No action needed here — the effect will set matchInfo and screen.
  }, []);

  const handlePlayAgain = useCallback(() => {
    setMatchInfo(null);
    setScreen('lobby');
  }, []);

  const handleMainMenu = useCallback(() => {
    ws.disconnect();
    setMatchInfo(null);
    setScreen('start');
  }, [ws]);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full" style={{ touchAction: 'none' }}>
      {showDebug && screen === 'practice' && <DebugOverlay info={practice.debugInfo} />}

      {screen === 'start' && (
        <StartScreen onPlayOnline={goToLobby} onPractice={goToPractice} onTutorial={goToTutorial} />
      )}

      {screen === 'tutorial' && (
        <TutorialScreen onComplete={handleTutorialComplete} />
      )}

      {screen === 'lobby' && (
        <LobbyScreen ws={ws} balance={coinBalance} onMatchFound={handleMatchFound} onBack={handleBackToStart} />
      )}

      {screen === 'ready' && matchInfo && (
        <ReadyScreen
          opponentName={matchInfo.opponent.displayName}
          wagerAmount={matchInfo.wagerAmount}
          waitingForOpponent={mp.waitingForOpponent || readySent}
          onReady={handleReady}
        />
      )}

      {screen === 'multiplayer' && (
        <MultiplayerGame mp={mp} onPlayAgain={handlePlayAgain} onMainMenu={handleMainMenu} onRematchAccepted={handleRematchAccepted} />
      )}

      {screen === 'practice' && (
        <PracticeGame practice={practice} onTutorialComplete={handleTutorialComplete} onPlayAgain={goToPractice} onMainMenu={handleBackToStart} />
      )}
    </div>
  );
}

// ─── Multiplayer game renderer ────────────────────────────────────────────

function MultiplayerGame({ mp, onPlayAgain, onMainMenu, onRematchAccepted }: {
  mp: ReturnType<typeof useMultiplayerGame>;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  onRematchAccepted: () => void;
}): JSX.Element | null {
  const { phase, match, activePrompt, currentRound, currentPrompt, runningTotalMs: _rt,
    currentMissCount, opponentPrompt, handleInput,
    coinsWon, newBalance, rematchState, rematchNewMatchId, requestRematch, declineRematch } = mp;

  // Handle rematch acceptance — transition to new match
  useEffect(() => {
    if (rematchNewMatchId) {
      onRematchAccepted();
    }
  }, [rematchNewMatchId, onRematchAccepted]);

  switch (phase.kind) {
    case 'countdown':
      return <CountdownScreen value={phase.value} />;
    case 'round_header':
      return <RoundHeaderScreen roundIndex={phase.roundIndex} score={match?.score ?? [0, 0]} />;
    case 'prompt_delay':
    case 'prompt_active':
    case 'prompt_feedback': {
      const results = match?.playerResults[currentRound] ?? [];
      const subPhase = phase.kind === 'prompt_delay' ? 'delay' as const
        : phase.kind === 'prompt_active' ? 'active' as const : 'feedback' as const;
      return (
        <GameplayScreen
          promptIndex={currentPrompt}
          subPhase={subPhase}
          prompt={activePrompt}
          feedbackType={phase.kind === 'prompt_feedback' ? phase.feedbackType : undefined}
          results={results}
          currentMissCount={currentMissCount}
          onInput={handleInput}
          tapPosition={phase.kind === 'prompt_feedback' ? phase.tapPosition : undefined}
          opponentPrompt={opponentPrompt}
        />
      );
    }
    case 'round_result': {
      if (!match) return null;
      const rr = match.roundResults[phase.roundIndex];
      if (!rr) return null;
      return <RoundResultScreen roundResult={rr} score={match.score} />;
    }
    case 'match_result': {
      if (!match) return null;
      return (
        <MatchResultScreen
          match={match}
          coinsWon={coinsWon}
          newBalance={newBalance}
          rematchState={rematchState}
          onRematch={requestRematch}
          onDeclineRematch={declineRematch}
          onPlayAgain={() => onPlayAgain()}
          onMainMenu={onMainMenu}
        />
      );
    }
    default:
      return <div className="flex items-center justify-center h-full"><p className="text-slate-500">Loading...</p></div>;
  }
}

// ─── Practice game renderer (existing local game) ─────────────────────────

function PracticeGame({ practice, onTutorialComplete, onPlayAgain, onMainMenu }: {
  practice: ReturnType<typeof useGame>;
  onTutorialComplete: () => void;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}): JSX.Element | null {
  const { phase, match, currentMissCount, handleInput } = practice;

  switch (phase.kind) {
    case 'start':
      return null;
    case 'tutorial':
      return <TutorialScreen onComplete={onTutorialComplete} />;
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
        : phase.kind === 'prompt_active' ? 'active' as const : 'feedback' as const;
      return (
        <GameplayScreen
          promptIndex={promptIndex} subPhase={subPhase} prompt={prompt}
          feedbackType={phase.kind === 'prompt_feedback' ? phase.feedbackType : undefined}
          results={results} currentMissCount={currentMissCount} onInput={handleInput}
          tapPosition={phase.kind === 'prompt_feedback' ? phase.tapPosition : undefined}
        />
      );
    }
    case 'round_result': {
      if (!match) return null;
      const rr = match.roundResults[phase.roundIndex];
      if (!rr) return null;
      return <RoundResultScreen roundResult={rr} score={match.score} />;
    }
    case 'match_result': {
      if (!match) return null;
      return (
        <MatchResultScreen
          match={match}
          coinsWon={0}
          newBalance={0}
          rematchState="idle"
          onRematch={() => {}}
          onDeclineRematch={() => {}}
          onPlayAgain={() => onPlayAgain()}
          onMainMenu={onMainMenu}
        />
      );
    }
    default:
      return null;
  }
}
