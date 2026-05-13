import { useState, useRef, useEffect, useCallback } from 'react';
import type { MatchId, PlayerId, PlayerInfo, WagerAmount, Prompt, PromptResult, RoundResult, Timestamp } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';
import type { WebSocketState } from '../ws/useWebSocket.js';
import type { GamePhase, MatchState, GameInput } from './types.js';
import { PLAYER_ID, OPPONENT_ID } from './types.js';

const FEEDBACK_DURATION_MS = 100;

export function useMultiplayerGame(
  matchId: MatchId,
  myPlayerId: PlayerId,
  _opponent: PlayerInfo,
  wagerAmount: WagerAmount,
  ws: WebSocketState,
) {
  const [phase, setPhase] = useState<GamePhase>({ kind: 'start' });
  const [activePrompt, setActivePrompt] = useState<Prompt | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentPrompt, setCurrentPrompt] = useState(0);
  const [playerResults, setPlayerResults] = useState<PromptResult[][]>([[], [], []]);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [runningTotalMs, setRunningTotalMs] = useState(0);
  const [currentMissCount, setCurrentMissCount] = useState(0);
  const [opponentPrompt, setOpponentPrompt] = useState(0);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [matchComplete, setMatchComplete] = useState(false);
  const [forfeit, setForfeit] = useState(false);

  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const promptAppearedAtRef = useRef(0);
  // Track which player slot I am (for normalizing A/B results)
  const iAmPlayerARef = useRef<boolean | null>(null);

  // Cleanup
  useEffect(() => {
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, []);

  // Process server messages
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg) return;

    switch (msg.type) {
      case 'WAITING_FOR_OPPONENT_READY':
        setWaitingForOpponent(true);
        break;

      case 'BOTH_READY':
        setWaitingForOpponent(false);
        break;

      case 'COUNTDOWN': {
        const value = msg.step === 'go' ? 0 : Number(msg.step);
        setPhase({ kind: 'countdown', value });
        break;
      }

      case 'ROUND_START': {
        const ri = msg.roundNumber - 1;
        setCurrentRound(ri);
        setCurrentPrompt(0);
        setRunningTotalMs(0);
        setCurrentMissCount(0);
        setOpponentPrompt(0);
        setPhase({ kind: 'round_header', roundIndex: ri });
        break;
      }

      case 'PROMPT_SHOW': {
        const ri = msg.roundNumber - 1;
        const pi = msg.promptNumber - 1;
        setCurrentRound(ri);
        setCurrentPrompt(pi);
        setActivePrompt(msg.prompt);
        setCurrentMissCount(0);
        promptAppearedAtRef.current = performance.now();
        setPhase({ kind: 'prompt_active', roundIndex: ri, promptIndex: pi, promptAppearedAt: performance.now() });
        break;
      }

      case 'PROMPT_RESULT': {
        const ri = msg.roundNumber - 1;
        const pi = msg.promptNumber - 1;
        setRunningTotalMs(msg.totalMs);
        setCurrentMissCount(msg.missCount);

        if (msg.hit) {
          // Hit — show feedback, then wait for next PROMPT_SHOW (delay phase)
          setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'hit' });
          // Add result
          setPlayerResults(prev => {
            const copy = prev.map((r, i) => i === ri ? [...r, makeResult(pi, msg)] : r);
            return copy;
          });
          feedbackTimerRef.current = setTimeout(() => {
            setPhase({ kind: 'prompt_delay', roundIndex: ri, promptIndex: pi + 1 });
            setActivePrompt(null);
          }, FEEDBACK_DURATION_MS);
        } else if (msg.reactionMs === null && msg.penaltyMs >= QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS && msg.missCount === 0) {
          // False start
          setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'false_start' });
          setPlayerResults(prev => {
            const r: PromptResult = { promptNumber: pi + 1, playerId: null, reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false, missCount: 0 };
            return prev.map((arr, i) => i === ri ? [...arr, r] : arr);
          });
          feedbackTimerRef.current = setTimeout(() => {
            setPhase({ kind: 'prompt_delay', roundIndex: ri, promptIndex: pi + 1 });
            setActivePrompt(null);
          }, 300);
        } else if (msg.reactionMs === null && !msg.hit) {
          // Timeout or miss
          if (msg.penaltyMs >= QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS) {
            // Timeout
            setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'timeout' });
            setPlayerResults(prev => {
              const r: PromptResult = { promptNumber: pi + 1, playerId: null, reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true, missCount: msg.missCount };
              return prev.map((arr, i) => i === ri ? [...arr, r] : arr);
            });
            feedbackTimerRef.current = setTimeout(() => {
              setPhase({ kind: 'prompt_delay', roundIndex: ri, promptIndex: pi + 1 });
              setActivePrompt(null);
            }, FEEDBACK_DURATION_MS);
          } else {
            // Miss — stay on same prompt
            setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'miss' });
            feedbackTimerRef.current = setTimeout(() => {
              setPhase({ kind: 'prompt_active', roundIndex: ri, promptIndex: pi, promptAppearedAt: promptAppearedAtRef.current });
            }, FEEDBACK_DURATION_MS);
          }
        }
        break;
      }

      case 'OPPONENT_PROGRESS':
        setOpponentPrompt(msg.promptNumber);
        break;

      case 'ROUND_RESULT': {
        const ri = msg.roundNumber - 1;
        // Determine if I am playerA
        if (iAmPlayerARef.current === null) {
          // First round result — figure out which slot I am by checking playerAResults
          const myResultsCount = playerResults[ri]?.length ?? 0;
          iAmPlayerARef.current = msg.playerAResults.length === myResultsCount;
        }
        const isA = iAmPlayerARef.current;
        const normalized: RoundResult = {
          roundNumber: msg.roundNumber,
          playerAResults: isA ? msg.playerAResults : msg.playerBResults,
          playerBResults: isA ? msg.playerBResults : msg.playerAResults,
          playerATotalMs: isA ? msg.playerATotalMs : msg.playerBTotalMs,
          playerBTotalMs: isA ? msg.playerBTotalMs : msg.playerATotalMs,
          winnerId: msg.winnerId === myPlayerId ? PLAYER_ID : msg.winnerId === null ? null : OPPONENT_ID,
        };
        setRoundResults(prev => [...prev, normalized]);
        const newScore: [number, number] = [...score];
        if (normalized.winnerId === PLAYER_ID) newScore[0]++;
        else if (normalized.winnerId === OPPONENT_ID) newScore[1]++;
        setScore(newScore);
        setPhase({ kind: 'round_result', roundIndex: ri });
        break;
      }

      case 'MATCH_RESULT': {
        setMatchComplete(true);
        setForfeit(msg.forfeit);
        // Round results already accumulated from ROUND_RESULT messages
        setPhase({ kind: 'match_result' });
        break;
      }

      case 'OPPONENT_DISCONNECTED':
        // Show notification but don't stop the game yet — server handles forfeit
        break;
    }
  }, [ws.lastMessage, myPlayerId, score, playerResults]);

  // Send PLAYER_READY on mount
  const sendReady = useCallback(() => {
    ws.send({ type: 'PLAYER_READY', matchId });
  }, [ws, matchId]);

  // Handle game input (tap/swipe/false_start)
  const handleInput = useCallback((input: GameInput) => {
    const ri = currentRound;
    const pi = currentPrompt;

    if (input.gestureType === 'false_start') {
      ws.send({
        type: 'TAP', matchId,
        roundNumber: ri + 1, promptNumber: pi + 1,
        x: input.normalizedX, y: input.normalizedY,
        timestamp: input.timestamp as Timestamp, isTrusted: input.isTrusted,
      });
      return;
    }

    if (input.gestureType === 'tap') {
      ws.send({
        type: 'TAP', matchId,
        roundNumber: ri + 1, promptNumber: pi + 1,
        x: input.normalizedX, y: input.normalizedY,
        timestamp: input.timestamp as Timestamp, isTrusted: input.isTrusted,
      });
    } else if (input.gestureType === 'swipe' && input.swipeDirection) {
      ws.send({
        type: 'SWIPE', matchId,
        roundNumber: ri + 1, promptNumber: pi + 1,
        startX: input.normalizedX, startY: input.normalizedY,
        endX: input.normalizedX, endY: input.normalizedY,
        timestamp: input.timestamp as Timestamp, isTrusted: input.isTrusted,
      });
    }
  }, [ws, matchId, currentRound, currentPrompt]);

  // Build MatchState compatible with existing components
  const matchState: MatchState | null = matchComplete || roundResults.length > 0 ? {
    seed: '', wagerAmount,
    roundConfigs: [],
    playerResults,
    opponentResults: [],
    roundResults,
    score,
  } : null;

  return {
    phase,
    match: matchState,
    activePrompt,
    currentRound,
    currentPrompt,
    runningTotalMs,
    currentMissCount,
    opponentPrompt,
    waitingForOpponent,
    handleInput,
    sendReady,
    forfeit,
  };
}

function makeResult(promptIndex: number, msg: { hit: boolean; reactionMs: number | null; missCount: number }): PromptResult {
  return {
    promptNumber: promptIndex + 1,
    playerId: null,
    reactionMs: msg.reactionMs,
    hit: msg.hit,
    falseStart: false,
    missed: false,
    timedOut: false,
    missCount: msg.missCount,
  };
}
