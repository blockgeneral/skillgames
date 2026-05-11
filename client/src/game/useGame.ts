import { useState, useRef, useEffect } from 'react';
import type { WagerAmount, PromptResult, RoundConfig } from '@skillgamez/shared';
import {
  generateMatchRounds,
  isTapOnTarget,
  isReactionTimeValid,
  scoreRound,
  determineMatchWinner,
  QUICK_DRAW_CONSTANTS,
  SIMULATED_OPPONENT,
} from '@skillgamez/shared';
import { createPrng, randomInRange } from './prng.js';
import { computeRunningTotal } from './scoring.js';
import type { GamePhase, MatchState, DebugInfo, PromptFeedback } from './types.js';
import { PLAYER_ID, OPPONENT_ID } from './types.js';

const TUTORIAL_KEY = 'skillgamez_tutorial_complete';
const COUNTDOWN_STEP_MS = 800;
const GO_DURATION_MS = 500;
const ROUND_HEADER_MS = 800;
const ROUND_RESULT_MS = 2500;
const HIT_FEEDBACK_MS = 100;
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
      const fsRoll = next();
      if (fsRoll < SIMULATED_OPPONENT.FALSE_START_RATE) {
        rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false });
        continue;
      }
      const hitRoll = next();
      if (hitRoll >= SIMULATED_OPPONENT.HIT_RATE) {
        rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: null, hit: false, falseStart: false, missed: true, timedOut: false });
        continue;
      }
      const ms = Math.round(randomInRange(next, SIMULATED_OPPONENT.MIN_REACTION_MS, SIMULATED_OPPONENT.MAX_REACTION_MS));
      rr.push({ promptNumber: p + 1, playerId: OPPONENT_ID, reactionMs: ms, hit: true, falseStart: false, missed: false, timedOut: false });
    }
    results.push(rr);
  }
  return results;
}

function feedbackDuration(type: PromptFeedback): number {
  switch (type) {
    case 'hit': return HIT_FEEDBACK_MS;
    case 'miss': return MISS_FEEDBACK_MS;
    case 'false_start': return FALSE_START_FEEDBACK_MS;
    case 'timeout': return TIMEOUT_FEEDBACK_MS;
  }
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Debug info sync
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
    const newResults = m.playerResults.map((r, i) =>
      i === roundIndex ? [...r, result] : r,
    );
    return { ...m, playerResults: newResults };
  }

  function startPromptDelay(roundIndex: number, promptIndex: number) {
    const m = matchRef.current;
    if (!m) return;
    const delay = m.roundConfigs[roundIndex]!.prompts[promptIndex]!.delay;
    setPhase({ kind: 'prompt_delay', roundIndex, promptIndex });
    tappedRef.current = false;

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
    const m = matchRef.current;
    if (!m) return;
    const result: PromptResult = {
      promptNumber: promptIndex + 1, playerId: PLAYER_ID,
      reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true,
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

    const updated: MatchState = {
      ...m,
      roundResults: [...m.roundResults, roundResult],
      score: newScore,
    };
    setMatch(updated);
    setPhase({ kind: 'round_result', roundIndex });

    timerRef.current = setTimeout(() => {
      const latest = matchRef.current;
      if (!latest) return;
      const matchWinner = determineMatchWinner(latest.roundResults, PLAYER_ID, OPPONENT_ID);
      const allPlayed = latest.roundResults.length >= QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH;

      if (matchWinner.winnerId !== null || allPlayed) {
        setPhase({ kind: 'match_result' });
      } else {
        startRound(roundIndex + 1);
      }
    }, ROUND_RESULT_MS);
  }

  function startRound(roundIndex: number) {
    const m = matchRef.current;
    if (!m) return;
    // Initialize empty results for this round
    const newResults = m.playerResults.map((r, i) =>
      i === roundIndex ? [] : r,
    );
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
        const duration = step === values.length - 1 ? GO_DURATION_MS : COUNTDOWN_STEP_MS;
        timerRef.current = setTimeout(advance, duration);
      } else {
        // Start first round
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
      opponentResults,
      roundResults: [],
      score: [0, 0],
    };
    startCountdown(newMatch);
  }

  function openTutorial() {
    clearTimers();
    setPhase({ kind: 'tutorial' });
  }

  function completeTutorial() {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    setPhase({ kind: 'start' });
  }

  function handleTap(normalizedX: number, normalizedY: number, timestamp: number, _isTrusted: boolean) {
    const p = phaseRef.current;
    const m = matchRef.current;
    if (!m) return;

    setDebugInfo(prev => ({ ...prev, lastTapNormalized: { x: normalizedX, y: normalizedY } }));

    if (p.kind === 'prompt_delay') {
      clearTimers();
      const { roundIndex, promptIndex } = p;
      const result: PromptResult = {
        promptNumber: promptIndex + 1, playerId: PLAYER_ID,
        reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false,
      };
      const updated = addPlayerResult(m, roundIndex, result);
      setMatch(updated);
      setPhase({
        kind: 'prompt_feedback', roundIndex, promptIndex,
        feedbackType: 'false_start',
        tapPosition: { x: normalizedX, y: normalizedY },
      });
      timerRef.current = setTimeout(() => {
        advanceToNextPrompt(roundIndex, promptIndex);
      }, FALSE_START_FEEDBACK_MS);
      return;
    }

    if (p.kind === 'prompt_active') {
      if (tappedRef.current) return;
      tappedRef.current = true;
      clearTimers();

      const { roundIndex, promptIndex } = p;
      const prompt = m.roundConfigs[roundIndex]!.prompts[promptIndex]!.prompt;
      const reactionMs = timestamp - promptAppearedAtRef.current;
      const onTarget = isTapOnTarget({ x: normalizedX, y: normalizedY }, prompt);
      const timeValid = isReactionTimeValid(reactionMs);

      setDebugInfo(prev => ({
        ...prev,
        lastReactionMs: Math.round(reactionMs),
        lastOnTarget: onTarget,
      }));

      let result: PromptResult;
      let fb: PromptFeedback;

      if (!timeValid.valid && timeValid.reason === 'timeout') {
        result = { promptNumber: promptIndex + 1, playerId: PLAYER_ID, reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true };
        fb = 'timeout';
      } else if (!onTarget) {
        result = { promptNumber: promptIndex + 1, playerId: PLAYER_ID, reactionMs: null, hit: false, falseStart: false, missed: true, timedOut: false };
        fb = 'miss';
      } else if (!timeValid.valid && timeValid.reason === 'below_human_floor') {
        result = { promptNumber: promptIndex + 1, playerId: PLAYER_ID, reactionMs: null, hit: false, falseStart: false, missed: true, timedOut: false };
        fb = 'miss';
      } else {
        result = { promptNumber: promptIndex + 1, playerId: PLAYER_ID, reactionMs: Math.round(reactionMs), hit: true, falseStart: false, missed: false, timedOut: false };
        fb = 'hit';
      }

      const updated = addPlayerResult(m, roundIndex, result);
      setMatch(updated);
      setPhase({ kind: 'prompt_feedback', roundIndex, promptIndex, feedbackType: fb });

      timerRef.current = setTimeout(() => {
        advanceToNextPrompt(roundIndex, promptIndex);
      }, feedbackDuration(fb));
      return;
    }
  }

  function resetToStart() {
    clearTimers();
    setPhase({ kind: 'start' });
    setMatch(null);
  }

  // Derived value for gameplay UI
  let runningTotalMs = 0;
  if (match && 'roundIndex' in phase) {
    const ri = (phase as { roundIndex: number }).roundIndex;
    runningTotalMs = computeRunningTotal(match.playerResults[ri] ?? []);
  }

  return { phase, match, debugInfo, runningTotalMs, startMatch, openTutorial, completeTutorial, handleTap, resetToStart };
}
