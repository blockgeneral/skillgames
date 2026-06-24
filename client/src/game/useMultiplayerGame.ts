import { useState, useRef, useEffect, useCallback } from 'react';
import type { MatchId, PlayerId, PlayerInfo, WagerAmount, Prompt, PromptResult, RoundResult, Timestamp } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS, isTapOnTarget } from '@skillgamez/shared';
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
  const [_matchComplete, setMatchComplete] = useState(false);
  const [forfeit, setForfeit] = useState(false);
  const [coinsWon, setCoinsWon] = useState(0);
  const [newBalance, setNewBalance] = useState(0);
  const [rematchState, setRematchState] = useState<'idle' | 'requesting' | 'offered' | 'declined'>('idle');
  const [rematchNewMatchId, setRematchNewMatchId] = useState<MatchId | null>(null);

  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const promptAppearedAtRef = useRef(0);
  // Track which player slot I am (for normalizing A/B results)
  const iAmPlayerARef = useRef<boolean | null>(null);
  // Prevent re-processing the same WebSocket message
  const lastProcessedRef = useRef<unknown>(null);

  // Optimistic feedback tracking: tracks the prompt index we've already shown feedback for
  // so that when PROMPT_RESULT arrives we can skip redundant UI updates
  const optimisticRef = useRef<{
    roundIndex: number;
    promptIndex: number;
    hit: boolean;
  } | null>(null);

  // Cleanup
  useEffect(() => {
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, []);

  // Reset all game state when matchId changes (new match or rematch)
  const prevMatchIdRef = useRef(matchId);
  useEffect(() => {
    if (matchId && matchId !== prevMatchIdRef.current) {
      prevMatchIdRef.current = matchId;
      setPhase({ kind: 'start' });
      setActivePrompt(null);
      setCurrentRound(0);
      setCurrentPrompt(0);
      setPlayerResults([[], [], []]);
      setRoundResults([]);
      setScore([0, 0]);
      setRunningTotalMs(0);
      setCurrentMissCount(0);
      setOpponentPrompt(0);
      setWaitingForOpponent(false);
      setMatchComplete(false);
      setForfeit(false);
      setCoinsWon(0);
      setNewBalance(0);
      setRematchState('idle');
      setRematchNewMatchId(null);
      iAmPlayerARef.current = null;
      lastProcessedRef.current = null;
      optimisticRef.current = null;
    }
  }, [matchId]);

  // Process server messages
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg || msg === lastProcessedRef.current) return;
    lastProcessedRef.current = msg;

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
        optimisticRef.current = null;
        setPhase({ kind: 'round_header', roundIndex: ri });
        feedbackTimerRef.current = setTimeout(() => {
          setPhase({ kind: 'prompt_delay', roundIndex: ri, promptIndex: 0 });
        }, 800);
        break;
      }

      case 'PROMPT_SHOW': {
        const ri = msg.roundNumber - 1;
        const pi = msg.promptNumber - 1;
        setCurrentRound(ri);
        setCurrentPrompt(pi);
        setActivePrompt(msg.prompt);
        setCurrentMissCount(0);
        optimisticRef.current = null;
        promptAppearedAtRef.current = performance.now();
        setPhase({ kind: 'prompt_active', roundIndex: ri, promptIndex: pi, promptAppearedAt: performance.now() });
        break;
      }

      case 'PROMPT_RESULT': {
        const ri = msg.roundNumber - 1;
        const pi = msg.promptNumber - 1;
        const opt = optimisticRef.current;

        // Check if we already showed optimistic feedback for this exact prompt
        if (opt && opt.roundIndex === ri && opt.promptIndex === pi) {
          // Server agrees with our optimistic prediction — just update authoritative totals
          if (opt.hit === msg.hit) {
            setRunningTotalMs(msg.totalMs);
            setCurrentMissCount(msg.missCount);
            // If it was a hit, result was already added optimistically
            // If it was a miss, we already showed miss feedback
            break;
          }
          // Server disagrees — snap to server's version (reconciliation)
          // Cancel any optimistic timer and fall through to normal handling
          if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
            feedbackTimerRef.current = undefined;
          }
          // If we optimistically added a result for a hit but server says miss,
          // remove the optimistic result
          if (opt.hit && !msg.hit) {
            setPlayerResults(prev =>
              prev.map((arr, i) => {
                if (i !== ri) return arr;
                // Remove the last result if it was our optimistic one
                const last = arr[arr.length - 1];
                if (last && last.promptNumber === pi + 1) return arr.slice(0, -1);
                return arr;
              })
            );
          }
          optimisticRef.current = null;
          // Fall through to normal handling below
        }

        setRunningTotalMs(msg.totalMs);
        setCurrentMissCount(msg.missCount);

        if (msg.hit) {
          setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'hit' });
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
        if (feedbackTimerRef.current) { clearTimeout(feedbackTimerRef.current); feedbackTimerRef.current = undefined; }
        optimisticRef.current = null;

        const ri = msg.roundNumber - 1;
        if (iAmPlayerARef.current === null) {
          const firstA = msg.playerAResults[0];
          iAmPlayerARef.current = firstA?.playerId === myPlayerId;
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
        // Replace optimistic results with server-authoritative results for this round
        setPlayerResults(prev =>
          prev.map((arr, i) => i === ri ? normalized.playerAResults : arr)
        );
        setRoundResults(prev => [...prev, normalized]);
        setScore(prev => {
          const newScore: [number, number] = [...prev];
          if (normalized.winnerId === PLAYER_ID) newScore[0]++;
          else if (normalized.winnerId === OPPONENT_ID) newScore[1]++;
          return newScore;
        });
        setPhase({ kind: 'round_result', roundIndex: ri });
        break;
      }

      case 'MATCH_RESULT': {
        if (feedbackTimerRef.current) { clearTimeout(feedbackTimerRef.current); feedbackTimerRef.current = undefined; }
        optimisticRef.current = null;

        setMatchComplete(true);
        setForfeit(msg.forfeit);
        setCoinsWon(msg.coinsWon);
        setNewBalance(msg.yourNewBalance);
        setPhase({ kind: 'match_result' });
        break;
      }

      case 'REMATCH_OFFERED':
        setRematchState('offered');
        break;

      case 'REMATCH_ACCEPTED':
        setRematchNewMatchId(msg.newMatchId);
        break;

      case 'REMATCH_DECLINED':
        setRematchState('declined');
        break;

      case 'OPPONENT_DISCONNECTED':
        break;
    }
  }, [ws.lastMessage, myPlayerId]);

  // Send PLAYER_READY on mount
  const sendReady = useCallback(() => {
    ws.send({ type: 'PLAYER_READY', matchId });
  }, [ws, matchId]);

  const requestRematch = useCallback(() => {
    ws.send({ type: 'REMATCH_REQUEST', matchId });
    setRematchState('requesting');
  }, [ws, matchId]);

  const declineRematch = useCallback(() => {
    ws.send({ type: 'REMATCH_DECLINE', matchId });
    setRematchState('idle');
  }, [ws, matchId]);

  // Handle game input (tap/swipe/false_start) with optimistic feedback
  const handleInput = useCallback((input: GameInput) => {
    const ri = currentRound;
    const pi = currentPrompt;
    const prompt = activePrompt;

    if (input.gestureType === 'false_start') {
      ws.send({
        type: 'TAP', matchId,
        roundNumber: ri + 1, promptNumber: pi + 1,
        x: input.normalizedX, y: input.normalizedY,
        timestamp: input.timestamp as Timestamp, isTrusted: input.isTrusted,
      });
      // False starts are cheap to show — let server handle it (no optimistic needed)
      return;
    }

    // Run local hit detection for optimistic feedback
    let localHit = false;
    if (prompt) {
      if (input.gestureType === 'tap' && prompt.type === 'tap') {
        localHit = isTapOnTarget({ x: input.normalizedX, y: input.normalizedY }, prompt);
      } else if (input.gestureType === 'swipe' && prompt.type === 'swipe' && input.swipeDirection && prompt.swipeDirection) {
        localHit = input.swipeDirection === prompt.swipeDirection;
      }
    }

    // Send to server (unchanged)
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
        endX: input.endNormalizedX ?? input.normalizedX,
        endY: input.endNormalizedY ?? input.normalizedY,
        timestamp: input.timestamp as Timestamp, isTrusted: input.isTrusted,
      });
    }

    // Show optimistic feedback immediately
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = undefined;
    }

    optimisticRef.current = { roundIndex: ri, promptIndex: pi, hit: localHit };

    if (localHit) {
      const reactionMs = Math.round(input.timestamp - promptAppearedAtRef.current);
      // Optimistic hit feedback
      setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'hit' });
      setPlayerResults(prev => {
        const optimisticResult: PromptResult = {
          promptNumber: pi + 1, playerId: null,
          reactionMs, hit: true, falseStart: false, missed: false, timedOut: false,
          missCount: currentMissCount,
        };
        return prev.map((arr, i) => i === ri ? [...arr, optimisticResult] : arr);
      });
      feedbackTimerRef.current = setTimeout(() => {
        setPhase({ kind: 'prompt_delay', roundIndex: ri, promptIndex: pi + 1 });
        setActivePrompt(null);
      }, FEEDBACK_DURATION_MS);
    } else {
      // Optimistic miss feedback
      setPhase({ kind: 'prompt_feedback', roundIndex: ri, promptIndex: pi, feedbackType: 'miss' });
      setCurrentMissCount(prev => prev + 1);
      feedbackTimerRef.current = setTimeout(() => {
        setPhase({ kind: 'prompt_active', roundIndex: ri, promptIndex: pi, promptAppearedAt: promptAppearedAtRef.current });
      }, FEEDBACK_DURATION_MS);
    }
  }, [ws, matchId, currentRound, currentPrompt, activePrompt, currentMissCount]);

  // Build MatchState
  const gameStarted = phase.kind !== 'start';
  const matchState: MatchState | null = gameStarted ? {
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
    coinsWon,
    newBalance,
    rematchState,
    rematchNewMatchId,
    requestRematch,
    declineRematch,
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
