import { useState, useCallback, useRef, useEffect } from 'react';
import type { WagerAmount } from '@skillgamez/shared';
import {
  generateMatchRounds,
  isTapOnTarget,
  isReactionTimeValid,
  QUICK_DRAW_CONSTANTS,
} from '@skillgamez/shared';
import { createPrng, randomInRange } from './prng.js';
import type { GamePhase, MatchState, RoundOutcome, DebugInfo } from './types.js';

function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateOpponentTime(seed: string, roundIndex: number): number {
  const next = createPrng(seed + '-opponent-' + roundIndex);
  return Math.round(randomInRange(next, 180, 400));
}

export function useGame() {
  const [phase, setPhase] = useState<GamePhase>({ kind: 'start' });
  const [match, setMatch] = useState<MatchState | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    phase: 'start',
    lastTapNormalized: null,
    lastReactionMs: null,
    lastOnTarget: null,
    currentPrompt: null,
    seed: '',
  });

  const promptAppearedAtRef = useRef<number>(0);
  const phaseRef = useRef<GamePhase>(phase);
  const matchRef = useRef<MatchState | null>(match);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    phaseRef.current = phase;
    setDebugInfo((d) => ({
      ...d,
      phase: phase.kind,
      currentPrompt:
        (phase.kind === 'prompted' || phase.kind === 'delay') && match
          ? match.rounds[match.currentRound]?.prompt ?? null
          : null,
    }));
  }, [phase, match]);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const startMatch = useCallback(
    (wagerAmount: WagerAmount) => {
      clearTimer();
      const seed = generateSeed();
      const rounds = generateMatchRounds(seed, wagerAmount);
      const newMatch: MatchState = {
        seed,
        wagerAmount,
        rounds,
        currentRound: 0,
        score: [0, 0],
        roundOutcomes: [],
        playerReactionTimes: [],
        opponentReactionTimes: [],
      };
      setMatch(newMatch);
      setDebugInfo((d) => ({ ...d, seed }));
      setPhase({ kind: 'get-ready', roundNumber: 1 });

      // Auto-advance from get-ready to delay after 500ms
      timerRef.current = setTimeout(() => {
        setPhase({ kind: 'delay', roundNumber: 1 });
        // Start delay timer for first round
        const delay = rounds[0]!.delay;
        timerRef.current = setTimeout(() => {
          const now = performance.now();
          promptAppearedAtRef.current = now;
          setPhase({ kind: 'prompted', roundNumber: 1, promptAppearedAt: now });
        }, delay);
      }, 500);
    },
    [clearTimer],
  );

  const advanceRound = useCallback(
    (outcome: RoundOutcome, currentMatch: MatchState) => {
      const roundIdx = currentMatch.currentRound;
      const newScore: [number, number] = [...currentMatch.score];
      if (outcome.type === 'hit' && outcome.youWon) newScore[0]++;
      else if (outcome.type === 'hit' && !outcome.youWon) newScore[1]++;
      else if (outcome.type === 'miss' || outcome.type === 'too-slow') newScore[1]++;
      else if (outcome.type === 'false-start') newScore[1]++;
      // draw: no score change

      const playerMs =
        outcome.type === 'hit'
          ? outcome.reactionMs
          : outcome.type === 'draw'
            ? outcome.reactionMs
            : null;
      const opponentMs =
        outcome.type === 'hit' || outcome.type === 'miss' || outcome.type === 'too-slow' || outcome.type === 'draw'
          ? outcome.opponentMs
          : null;

      const updated: MatchState = {
        ...currentMatch,
        currentRound: roundIdx + 1,
        score: newScore,
        roundOutcomes: [...currentMatch.roundOutcomes, outcome],
        playerReactionTimes: [...currentMatch.playerReactionTimes, playerMs],
        opponentReactionTimes: [...currentMatch.opponentReactionTimes, opponentMs],
      };
      setMatch(updated);

      // Show round result
      setPhase({ kind: 'round-result', roundNumber: roundIdx + 1, outcome });

      timerRef.current = setTimeout(() => {
        const nextRound = roundIdx + 1;
        // Check if match over (first to 3, or all 5 played)
        if (
          newScore[0] >= QUICK_DRAW_CONSTANTS.ROUNDS_TO_WIN ||
          newScore[1] >= QUICK_DRAW_CONSTANTS.ROUNDS_TO_WIN ||
          nextRound >= QUICK_DRAW_CONSTANTS.TOTAL_ROUNDS
        ) {
          setPhase({ kind: 'match-result' });
          return;
        }

        // Next round: get-ready → delay → prompted
        const rn = nextRound + 1;
        setPhase({ kind: 'get-ready', roundNumber: rn });
        timerRef.current = setTimeout(() => {
          setPhase({ kind: 'delay', roundNumber: rn });
          const delay = updated.rounds[nextRound]!.delay;
          timerRef.current = setTimeout(() => {
            const now = performance.now();
            promptAppearedAtRef.current = now;
            setPhase({ kind: 'prompted', roundNumber: rn, promptAppearedAt: now });
          }, delay);
        }, 500);
      }, 1500);
    },
    [],
  );

  const handleTap = useCallback(
    (normalizedX: number, normalizedY: number, timestamp: number, _isTrusted: boolean) => {
      const p = phaseRef.current;
      const m = matchRef.current;
      if (!m) return;

      setDebugInfo((d) => ({
        ...d,
        lastTapNormalized: { x: normalizedX, y: normalizedY },
      }));

      if (p.kind === 'delay') {
        // False start
        clearTimer();
        const outcome: RoundOutcome = { type: 'false-start' };
        advanceRound(outcome, m);
        return;
      }

      if (p.kind === 'prompted') {
        clearTimer();
        const reactionMs = timestamp - promptAppearedAtRef.current;
        const roundConfig = m.rounds[m.currentRound]!;
        const prompt = roundConfig.prompt;
        const opponentMs = generateOpponentTime(m.seed, m.currentRound);
        const onTarget = isTapOnTarget({ x: normalizedX, y: normalizedY }, prompt);
        const timeValid = isReactionTimeValid(reactionMs);

        setDebugInfo((d) => ({
          ...d,
          lastReactionMs: Math.round(reactionMs),
          lastOnTarget: onTarget,
        }));

        if (!timeValid.valid && timeValid.reason === 'timeout') {
          advanceRound({ type: 'too-slow', opponentMs }, m);
          return;
        }

        if (!onTarget || (!timeValid.valid && timeValid.reason === 'below_human_floor')) {
          advanceRound({ type: 'miss', opponentMs }, m);
          return;
        }

        const roundedMs = Math.round(reactionMs);
        if (Math.abs(roundedMs - opponentMs) <= 1) {
          advanceRound({ type: 'draw', reactionMs: roundedMs, opponentMs }, m);
        } else {
          advanceRound({
            type: 'hit',
            reactionMs: roundedMs,
            opponentMs,
            youWon: roundedMs < opponentMs,
          }, m);
        }
        return;
      }
    },
    [clearTimer, advanceRound],
  );

  const resetToStart = useCallback(() => {
    clearTimer();
    setPhase({ kind: 'start' });
    setMatch(null);
  }, [clearTimer]);

  return { phase, match, debugInfo, startMatch, handleTap, resetToStart };
}
