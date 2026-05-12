import { useState, useRef, useEffect } from 'react';
import type { WagerAmount, PromptResult, RoundConfig } from '@skillgamez/shared';
import {
  generateMatchRounds,
  isTapOnTarget,
  isReactionTimeValid,
  scoreRound,
  QUICK_DRAW_CONSTANTS,
  SIMULATED_OPPONENT,
} from '@skillgamez/shared';
import { createPrng, randomInRange } from './prng.js';
import { computeRunningTotal } from './scoring.js';
import type { GamePhase, GameInput, MatchState, DebugInfo } from './types.js';
import { PLAYER_ID, OPPONENT_ID } from './types.js';

const TUTORIAL_KEY = 'skillgamez_tutorial_complete';
const COUNTDOWN_STEP_MS = 800;
const GO_DURATION_MS = 500;
const ROUND_HEADER_MS = 800;
const ROUND_RESULT_MS = 2500;
const HIT_FEEDBACK_MS = 100;
const SWIPE_HIT_FEEDBACK_MS = 150;
const MISS_FEEDBACK_MS = 100;
const FALSE_START_FEEDBACK_MS = 300;
const TIMEOUT_FEEDBACK_MS = 100;

function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateOpponentResults(seed: string, roundConfigs: RoundConfig[]): PromptResult[][] {
  const next = createPrng(seed + '-opponent');
  const results: PromptResult[][] = [];
  for (let r = 0; r < roundConfigs.length; r++) {
    const rr: PromptResult[] = [];
    for (let p = 0; p < roundConfigs[r]!.prompts.length; p++) {
      const promptType = roundConfigs[r]!.prompts[p]!.prompt.type;
      const extraMs = promptType === 'swipe' ? SIMULATED_OPPONENT.SWIPE_EXTRA_MS : 0;
      const fsRoll = next();
      if (fsRoll < SIMULATED_OPPONENT.FALSE_START_RATE) {
        rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false, missCount: 0 });
        continue;
      }
      const hitRoll = next();
      if (hitRoll >= SIMULATED_OPPONENT.HIT_RATE) {
        const baseMs = Math.round(randomInRange(next, SIMULATED_OPPONENT.MIN_REACTION_MS + extraMs, SIMULATED_OPPONENT.MAX_REACTION_MS + extraMs));
        rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: baseMs + 200, hit: true, falseStart: false, missed: false, timedOut: false, missCount: 1 });
        continue;
      }
      const ms = Math.round(randomInRange(next, SIMULATED_OPPONENT.MIN_REACTION_MS + extraMs, SIMULATED_OPPONENT.MAX_REACTION_MS + extraMs));
      rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: ms, hit: true, falseStart: false, missed: false, timedOut: false, missCount: 0 });
    }
    results.push(rr);
  }
  return results;
}

export function useGame() {
  const [phase, setPhase] = useState<GamePhase>({ kind: 'start' });
  const [match, setMatch] = useState<MatchState | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    phase: 'start', roundIndex: 0, promptIndex: 0, totalPrompts: 8,
    lastTapNormalized: null, lastReactionMs: null, lastOnTarget: null,
    currentPrompt: null, seed: '', runningScore: 0, opponentRoundResults: null,
  });

  const promptAppearedAtRef = useRef(0);
  const phaseRef = useRef<GamePhase>(phase);
  const matchRef = useRef<MatchState | null>(match);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tappedRef = useRef(false);
  const missCountRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const p = phase;
    const m = match;
    const ri = 'roundIndex' in p ? (p as { roundIndex: number }).roundIndex : 0;
    const pi = 'promptIndex' in p ? (p as { promptIndex: number }).promptIndex : 0;
    setDebugInfo(prev => ({
      ...prev,
      phase: p.kind + (p.kind === 'countdown' ? `(${p.value})` : '')
        + (p.kind === 'prompt_feedback' ? `(${p.feedbackType})` : ''),
      roundIndex: ri,
      promptIndex: pi,
      totalPrompts: QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND,
      currentPrompt: m?.roundConfigs[ri]?.prompts[pi]?.prompt ?? null,
      seed: m?.seed ?? '',
      runningScore: computeRunningTotal(m?.playerResults[ri] ?? []),
      opponentRoundResults: m?.opponentResults[ri] ?? null,
    }));
  }, [phase, match]);

  // ─── Internal engine ────────────────────────────────────────────────

  function clearTimers() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = undefined; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = undefined; }
  }

  function addPlayerResult(m: MatchState, roundIndex: number, result: PromptResult): MatchState {
    const newResults = m.playerResults.map((r, i) => i === roundIndex ? [...r, result] : r);
    return { ...m, playerResults: newResults };
  }

  function startPromptDelay(roundIndex: number, promptIndex: number) {
    const m = matchRef.current;
    if (!m) return;
    const delay = m.roundConfigs[roundIndex]!.prompts[promptIndex]!.delay;
    setPhase({ kind: 'prompt_delay', roundIndex, promptIndex });
    tappedRef.current = false;
    missCountRef.current = 0;

    timerRef.current = setTimeout(() => {
      const now = performance.now();
      promptAppearedAtRef.current = now;
      tappedRef.current = false;
      setPhase({ kind: 'prompt_active', roundIndex, promptIndex, promptAppearedAt: now });

      timeoutRef.current = setTimeout(() => {
        onPromptTimeout(roundIndex, promptIndex);
      }, QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS);
    }, delay);
  }

  function onPromptTimeout(roundIndex: number, promptIndex: number) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = undefined; }
    timeoutRef.current = undefined;

    const m = matchRef.current;
    if (!m) return;
    const result: PromptResult = {
      promptNumber: promptIndex + 1, playerId: PLAYER_ID,
      reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true,
      missCount: missCountRef.current,
    };
    const updated = addPlayerResult(m, roundIndex, result);
    setMatch(updated);
    setPhase({ kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: 'timeout' });

    timerRef.current = setTimeout(() => {
      advanceToNextPrompt(roundIndex, promptIndex);
    }, TIMEOUT_FEEDBACK_MS);
  }

  function advanceToNextPrompt(roundIndex: number, promptIndex: number) {
    const next = promptIndex + 1;
    if (next >= QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND) {
      finishRound(roundIndex);
    } else {
      startPromptDelay(roundIndex, next);
    }
  }

  function finishRound(roundIndex: number) {
    const m = matchRef.current;
    if (!m) return;
    const playerRes = m.playerResults[roundIndex] ?? [];
    const opponentRes = m.opponentResults[roundIndex] ?? [];
    const roundResult = scoreRound(playerRes, opponentRes, PLAYER_ID, OPPONENT_ID, roundIndex + 1);

    const newScore: [number, number] = [...m.score];
    if (roundResult.winnerId === PLAYER_ID) newScore[0]++;
    else if (roundResult.winnerId === OPPONENT_ID) newScore[1]++;

    const updated: MatchState = { ...m, roundResults: [...m.roundResults, roundResult], score: newScore };
    setMatch(updated);
    setPhase({ kind: 'round_result', roundIndex });

    timerRef.current = setTimeout(() => {
      const latest = matchRef.current;
      if (!latest) return;
      if (latest.roundResults.length >= QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH) {
        setPhase({ kind: 'match_result' });
      } else {
        startRound(roundIndex + 1);
      }
    }, ROUND_RESULT_MS);
  }

  function startRound(roundIndex: number) {
    const m = matchRef.current;
    if (!m) return;
    const newResults = m.playerResults.map((r, i) => i === roundIndex ? [] : r);
    setMatch({ ...m, playerResults: newResults });
    setPhase({ kind: 'round_header', roundIndex });

    timerRef.current = setTimeout(() => {
      startPromptDelay(roundIndex, 0);
    }, ROUND_HEADER_MS);
  }

  function startCountdown(newMatch: MatchState) {
    setMatch(newMatch);
    const values = [3, 2, 1, 0];
    let step = 0;
    setPhase({ kind: 'countdown', value: values[0]! });

    function advance() {
      step++;
      if (step < values.length) {
        setPhase({ kind: 'countdown', value: values[step]! });
        timerRef.current = setTimeout(advance, step === values.length - 1 ? GO_DURATION_MS : COUNTDOWN_STEP_MS);
      } else {
        startRound(0);
      }
    }
    timerRef.current = setTimeout(advance, COUNTDOWN_STEP_MS);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  function startMatch(wagerAmount: WagerAmount) {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      setPhase({ kind: 'tutorial' });
      return;
    }
    clearTimers();
    const seed = generateSeed();
    const roundConfigs = generateMatchRounds(seed, wagerAmount);
    const opponentResults = generateOpponentResults(seed, roundConfigs);
    const newMatch: MatchState = {
      seed, wagerAmount, roundConfigs,
      playerResults: roundConfigs.map(() => []),
      opponentResults, roundResults: [], score: [0, 0],
    };
    startCountdown(newMatch);
  }

  function openTutorial() { clearTimers(); setPhase({ kind: 'tutorial' }); }
  function completeTutorial() { localStorage.setItem(TUTORIAL_KEY, 'true'); setPhase({ kind: 'start' }); }

  function handleInput(input: GameInput) {
    const p = phaseRef.current;
    const m = matchRef.current;
    if (!m) return;

    setDebugInfo(prev => ({ ...prev, lastTapNormalized: { x: input.normalizedX, y: input.normalizedY } }));

    // False start during delay
    if (input.gestureType === 'false_start') {
      if (p.kind !== 'prompt_delay') return;
      clearTimers();
      const { roundIndex, promptIndex } = p;
      const result: PromptResult = {
        promptNumber: promptIndex + 1, playerId: PLAYER_ID,
        reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false, missCount: 0,
      };
      const updated = addPlayerResult(m, roundIndex, result);
      setMatch(updated);
      setPhase({
        kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: 'false_start',
        tapPosition: { x: input.normalizedX, y: input.normalizedY },
      });
      timerRef.current = setTimeout(() => { advanceToNextPrompt(roundIndex, promptIndex); }, FALSE_START_FEEDBACK_MS);
      return;
    }

    // Active phase input (tap or swipe)
    if (p.kind !== 'prompt_active') return;
    if (tappedRef.current) return;
    tappedRef.current = true;

    const { roundIndex, promptIndex } = p;
    const promptConfig = m.roundConfigs[roundIndex]!.prompts[promptIndex]!;
    const prompt = promptConfig.prompt;
    const reactionMs = input.timestamp - promptAppearedAtRef.current;
    const timeValid = isReactionTimeValid(reactionMs);

    setDebugInfo(prev => ({ ...prev, lastReactionMs: Math.round(reactionMs) }));

    // Timeout
    if (!timeValid.valid && timeValid.reason === 'timeout') {
      clearTimers();
      const result: PromptResult = {
        promptNumber: promptIndex + 1, playerId: PLAYER_ID,
        reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true,
        missCount: missCountRef.current,
      };
      setMatch(addPlayerResult(m, roundIndex, result));
      setPhase({ kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: 'timeout' });
      timerRef.current = setTimeout(() => { advanceToNextPrompt(roundIndex, promptIndex); }, TIMEOUT_FEEDBACK_MS);
      return;
    }

    // Determine if the input matches the prompt type
    let onTarget = false;

    if (prompt.type === 'tap' && input.gestureType === 'tap') {
      onTarget = isTapOnTarget({ x: input.normalizedX, y: input.normalizedY }, prompt);
    } else if (prompt.type === 'swipe' && input.gestureType === 'swipe' && input.swipeDirection && prompt.swipeDirection) {
      // For swipe validation we use pixel distance (handled in GameplayScreen), direction check here
      onTarget = input.swipeDirection === prompt.swipeDirection;
    }
    // Wrong input type (tap on swipe or swipe on tap) → onTarget stays false

    if (!timeValid.valid && timeValid.reason === 'below_human_floor') {
      onTarget = false;
    }

    setDebugInfo(prev => ({ ...prev, lastOnTarget: onTarget }));

    // Miss — keep prompt active, accumulate penalty, allow re-tap
    if (!onTarget) {
      missCountRef.current++;
      setPhase({ kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: 'miss' });
      timerRef.current = setTimeout(() => {
        tappedRef.current = false;
        setPhase({ kind: 'prompt_active', roundIndex, promptIndex, promptAppearedAt: promptAppearedAtRef.current });
      }, MISS_FEEDBACK_MS);
      return;
    }

    // Hit!
    clearTimers();
    const isSwipe = prompt.type === 'swipe';
    const result: PromptResult = {
      promptNumber: promptIndex + 1, playerId: PLAYER_ID,
      reactionMs: Math.round(reactionMs), hit: true, falseStart: false, missed: false, timedOut: false,
      missCount: missCountRef.current,
    };
    setMatch(addPlayerResult(m, roundIndex, result));
    setPhase({ kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: 'hit' });
    timerRef.current = setTimeout(() => {
      advanceToNextPrompt(roundIndex, promptIndex);
    }, isSwipe ? SWIPE_HIT_FEEDBACK_MS : HIT_FEEDBACK_MS);
  }

  function resetToStart() { clearTimers(); setPhase({ kind: 'start' }); setMatch(null); }

  let runningTotalMs = 0;
  if (match && 'roundIndex' in phase) {
    const ri = (phase as { roundIndex: number }).roundIndex;
    runningTotalMs = computeRunningTotal(match.playerResults[ri] ?? []);
  }

  return {
    phase, match, debugInfo, runningTotalMs,
    currentMissCount: missCountRef.current,
    startMatch, openTutorial, completeTutorial, handleInput, resetToStart,
  };
}
