import type { PlayerId, MatchId, Timestamp, PromptResult, RoundResult } from '@skillgamez/shared';
import type { ServerMessage } from '@skillgamez/shared';
import {
  generateMatchRounds,
  isTapOnTarget,
  isReactionTimeValid,
  scoreRound,
  determineMatchWinner,
  QUICK_DRAW_CONSTANTS,
} from '@skillgamez/shared';
import type { RoundConfig, SwipeDirection } from '@skillgamez/shared';
import type { ActiveMatch } from '../match/MatchRegistry.js';
import { logInput } from './InputLogger.js';

type SessionPhase = 'waiting_for_ready' | 'countdown' | 'playing' | 'round_result' | 'complete';

interface PlayerRoundState {
  currentPrompt: number;
  promptActiveAt: number | null;
  missCountOnCurrent: number;
  results: PromptResult[];
  done: boolean;
  delayTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

export interface PlayerInput {
  type: 'tap' | 'swipe';
  roundNumber: number;
  promptNumber: number;
  x?: number;
  y?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  swipeDirection?: SwipeDirection;
  timestamp: number;
  isTrusted: boolean;
}

export class QuickDrawSession {
  readonly matchId: MatchId;
  readonly playerA: PlayerId;
  readonly playerB: PlayerId;
  readonly seed: string;
  readonly rounds: RoundConfig[];

  private phase: SessionPhase = 'waiting_for_ready';
  private currentRound = 0;
  private readyPlayers = new Set<string>();
  private playerStates = new Map<string, PlayerRoundState>();
  private allRoundResults: RoundResult[] = [];
  private allPlayerResults: PromptResult[][] = []; // playerA per round
  private allPlayerBResults: PromptResult[][] = []; // playerB per round
  private timers: ReturnType<typeof setTimeout>[] = [];

  private send: (playerId: PlayerId, msg: ServerMessage) => void;
  private onComplete: (matchId: MatchId) => void;

  constructor(
    match: ActiveMatch,
    send: (playerId: PlayerId, msg: ServerMessage) => void,
    onComplete: (matchId: MatchId) => void,
  ) {
    this.matchId = match.matchId;
    this.playerA = match.playerA;
    this.playerB = match.playerB;
    this.seed = match.seed;
    this.rounds = generateMatchRounds(match.seed, match.wagerAmount);
    this.send = send;
    this.onComplete = onComplete;
  }

  get currentPhase(): SessionPhase { return this.phase; }

  handleReady(playerId: PlayerId): void {
    if (this.phase !== 'waiting_for_ready') return;
    this.readyPlayers.add(playerId);

    if (this.readyPlayers.size === 1) {
      this.send(playerId, { type: 'WAITING_FOR_OPPONENT_READY', matchId: this.matchId });
    }
    if (this.readyPlayers.size >= 2) {
      this.sendBoth({ type: 'BOTH_READY', matchId: this.matchId });
      this.startCountdown();
    }
  }

  handleInput(playerId: PlayerId, input: PlayerInput): void {
    if (this.phase !== 'playing') return;
    const state = this.playerStates.get(playerId);
    if (!state || state.done) return;

    const roundIndex = this.currentRound;
    const promptIndex = state.currentPrompt;
    const serverNow = Date.now();

    // Validate round/prompt numbers
    if (input.roundNumber !== roundIndex + 1 || input.promptNumber !== promptIndex + 1) {
      void logInput({
        matchId: this.matchId, playerId, roundNumber: input.roundNumber,
        promptNumber: input.promptNumber, inputType: input.type,
        timestamp: input.timestamp as Timestamp, serverReceivedAt: serverNow as Timestamp,
        data: {}, isTrusted: input.isTrusted, reactionMs: null, result: 'rejected',
      });
      return;
    }

    // False start: input during delay phase
    if (state.promptActiveAt === null) {
      if (state.delayTimer) { clearTimeout(state.delayTimer); state.delayTimer = null; }

      const result: PromptResult = {
        promptNumber: promptIndex + 1, playerId,
        reactionMs: null, hit: false, falseStart: true, missed: false, timedOut: false, missCount: 0,
      };
      state.results.push(result);

      const totalMs = computeTotal(state.results);
      this.send(playerId, {
        type: 'PROMPT_RESULT', matchId: this.matchId,
        roundNumber: roundIndex + 1, promptNumber: promptIndex + 1,
        hit: false, reactionMs: null, missCount: 0,
        penaltyMs: QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS, totalMs,
      });
      this.sendOpponentProgress(playerId, roundIndex, promptIndex, false);

      void logInput({
        matchId: this.matchId, playerId, roundNumber: roundIndex + 1,
        promptNumber: promptIndex + 1, inputType: 'false_start',
        timestamp: input.timestamp as Timestamp, serverReceivedAt: serverNow as Timestamp,
        data: {}, isTrusted: input.isTrusted, reactionMs: null, result: 'false_start',
      });

      this.advanceToNextPrompt(playerId, roundIndex, promptIndex);
      return;
    }

    // Active phase — validate input
    const reactionMs = serverNow - state.promptActiveAt;
    const prompt = this.rounds[roundIndex]!.prompts[promptIndex]!.prompt;
    const timeValid = isReactionTimeValid(reactionMs);

    if (!timeValid.valid && timeValid.reason === 'timeout') return; // timeout timer handles this

    let onTarget = false;
    if (prompt.type === 'tap' && input.type === 'tap' && input.x !== undefined && input.y !== undefined) {
      onTarget = isTapOnTarget({ x: input.x, y: input.y }, prompt);
    } else if (prompt.type === 'swipe' && input.type === 'swipe' && input.swipeDirection && prompt.swipeDirection) {
      onTarget = input.swipeDirection === prompt.swipeDirection;
    }

    if (!timeValid.valid && timeValid.reason === 'below_human_floor') onTarget = false;

    if (!onTarget) {
      // Miss — keep prompt active
      state.missCountOnCurrent++;
      const missPenalty = state.missCountOnCurrent * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
      this.send(playerId, {
        type: 'PROMPT_RESULT', matchId: this.matchId,
        roundNumber: roundIndex + 1, promptNumber: promptIndex + 1,
        hit: false, reactionMs: null, missCount: state.missCountOnCurrent,
        penaltyMs: missPenalty, totalMs: computeTotal(state.results) + missPenalty,
      });

      void logInput({
        matchId: this.matchId, playerId, roundNumber: roundIndex + 1,
        promptNumber: promptIndex + 1, inputType: input.type,
        timestamp: input.timestamp as Timestamp, serverReceivedAt: serverNow as Timestamp,
        data: { x: input.x, y: input.y, direction: input.swipeDirection },
        isTrusted: input.isTrusted, reactionMs: Math.round(reactionMs), result: 'miss',
      });
      return;
    }

    // Hit!
    if (state.timeoutTimer) { clearTimeout(state.timeoutTimer); state.timeoutTimer = null; }

    const result: PromptResult = {
      promptNumber: promptIndex + 1, playerId,
      reactionMs: Math.round(reactionMs), hit: true, falseStart: false, missed: false, timedOut: false,
      missCount: state.missCountOnCurrent,
    };
    state.results.push(result);

    const totalMs = computeTotal(state.results);
    this.send(playerId, {
      type: 'PROMPT_RESULT', matchId: this.matchId,
      roundNumber: roundIndex + 1, promptNumber: promptIndex + 1,
      hit: true, reactionMs: Math.round(reactionMs), missCount: state.missCountOnCurrent,
      penaltyMs: state.missCountOnCurrent * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS, totalMs,
    });

    void logInput({
      matchId: this.matchId, playerId, roundNumber: roundIndex + 1,
      promptNumber: promptIndex + 1, inputType: input.type,
      timestamp: input.timestamp as Timestamp, serverReceivedAt: serverNow as Timestamp,
      data: { x: input.x, y: input.y, direction: input.swipeDirection },
      isTrusted: input.isTrusted, reactionMs: Math.round(reactionMs), result: 'hit',
    });

    this.sendOpponentProgress(playerId, roundIndex, promptIndex, false);
    this.advanceToNextPrompt(playerId, roundIndex, promptIndex);
  }

  handleDisconnect(playerId: PlayerId): void {
    const opponent = playerId === this.playerA ? this.playerB : this.playerA;
    this.send(opponent, { type: 'OPPONENT_DISCONNECTED', matchId: this.matchId });
  }

  forfeit(disconnectedPlayerId: PlayerId): void {
    if (this.phase === 'complete') return;
    this.clearAllTimers();
    this.phase = 'complete';

    const winnerId = disconnectedPlayerId === this.playerA ? this.playerB : this.playerA;
    this.sendBoth({
      type: 'MATCH_RESULT', matchId: this.matchId, winnerId,
      playerATotalMs: 0, playerBTotalMs: 0, roundResults: this.allRoundResults, forfeit: true,
    });
    this.onComplete(this.matchId);
  }

  destroy(): void {
    this.clearAllTimers();
  }

  // ─── Internal ───────────────────────────────────────────────────────

  private startCountdown(): void {
    this.phase = 'countdown';
    const steps = ['3', '2', '1', 'go'];
    let i = 0;
    const advance = () => {
      this.sendBoth({ type: 'COUNTDOWN', matchId: this.matchId, step: steps[i]! });
      i++;
      if (i < steps.length) {
        this.addTimer(setTimeout(advance, 800));
      } else {
        this.addTimer(setTimeout(() => this.startRound(0), 500));
      }
    };
    advance();
  }

  private startRound(roundIndex: number): void {
    this.currentRound = roundIndex;
    this.phase = 'playing';
    const round = this.rounds[roundIndex]!;

    for (const pid of [this.playerA, this.playerB]) {
      this.playerStates.set(pid, {
        currentPrompt: 0, promptActiveAt: null, missCountOnCurrent: 0,
        results: [], done: false, delayTimer: null, timeoutTimer: null,
      });
    }

    this.sendBoth({ type: 'ROUND_START', matchId: this.matchId, roundNumber: roundIndex + 1, promptHash: round.roundHash });

    for (const pid of [this.playerA, this.playerB]) {
      this.startPromptDelay(pid, roundIndex, 0);
    }
  }

  private startPromptDelay(playerId: PlayerId, roundIndex: number, promptIndex: number): void {
    const state = this.playerStates.get(playerId)!;
    state.currentPrompt = promptIndex;
    state.promptActiveAt = null;
    state.missCountOnCurrent = 0;

    const delay = this.rounds[roundIndex]!.prompts[promptIndex]!.delay;
    const timer = setTimeout(() => this.showPrompt(playerId, roundIndex, promptIndex), delay);
    state.delayTimer = timer;
    this.addTimer(timer);
  }

  private showPrompt(playerId: PlayerId, roundIndex: number, promptIndex: number): void {
    const state = this.playerStates.get(playerId)!;
    const prompt = this.rounds[roundIndex]!.prompts[promptIndex]!.prompt;
    const now = Date.now();
    state.promptActiveAt = now;
    state.delayTimer = null;

    this.send(playerId, {
      type: 'PROMPT_SHOW', matchId: this.matchId,
      roundNumber: roundIndex + 1, promptNumber: promptIndex + 1,
      prompt, timestamp: now as Timestamp,
    });

    const timer = setTimeout(
      () => this.handleTimeout(playerId, roundIndex, promptIndex),
      QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS,
    );
    state.timeoutTimer = timer;
    this.addTimer(timer);
  }

  private handleTimeout(playerId: PlayerId, roundIndex: number, promptIndex: number): void {
    const state = this.playerStates.get(playerId);
    if (!state || state.done || state.currentPrompt !== promptIndex) return;
    state.timeoutTimer = null;

    const result: PromptResult = {
      promptNumber: promptIndex + 1, playerId,
      reactionMs: null, hit: false, falseStart: false, missed: false, timedOut: true,
      missCount: state.missCountOnCurrent,
    };
    state.results.push(result);

    const totalMs = computeTotal(state.results);
    this.send(playerId, {
      type: 'PROMPT_RESULT', matchId: this.matchId,
      roundNumber: roundIndex + 1, promptNumber: promptIndex + 1,
      hit: false, reactionMs: null, missCount: state.missCountOnCurrent,
      penaltyMs: QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS + state.missCountOnCurrent * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS,
      totalMs,
    });

    void logInput({
      matchId: this.matchId, playerId, roundNumber: roundIndex + 1,
      promptNumber: promptIndex + 1, inputType: 'tap',
      timestamp: 0 as Timestamp, serverReceivedAt: Date.now() as Timestamp,
      data: {}, isTrusted: true, reactionMs: null, result: 'timeout',
    });

    this.sendOpponentProgress(playerId, roundIndex, promptIndex, false);
    this.advanceToNextPrompt(playerId, roundIndex, promptIndex);
  }

  private advanceToNextPrompt(playerId: PlayerId, roundIndex: number, promptIndex: number): void {
    const state = this.playerStates.get(playerId)!;
    const next = promptIndex + 1;

    if (next >= QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND) {
      state.done = true;
      state.currentPrompt = next;
      this.sendOpponentProgress(playerId, roundIndex, next, true);
      this.checkRoundComplete(roundIndex);
    } else {
      this.startPromptDelay(playerId, roundIndex, next);
    }
  }

  private checkRoundComplete(roundIndex: number): void {
    const stateA = this.playerStates.get(this.playerA)!;
    const stateB = this.playerStates.get(this.playerB)!;
    if (!stateA.done || !stateB.done) return;

    this.phase = 'round_result';
    const roundResult = scoreRound(stateA.results, stateB.results, this.playerA, this.playerB, roundIndex + 1);
    this.allRoundResults.push(roundResult);
    this.allPlayerResults.push(stateA.results);
    this.allPlayerBResults.push(stateB.results);

    this.sendBoth({
      type: 'ROUND_RESULT', matchId: this.matchId,
      roundNumber: roundIndex + 1,
      playerATotalMs: roundResult.playerATotalMs, playerBTotalMs: roundResult.playerBTotalMs,
      playerAResults: stateA.results, playerBResults: stateB.results,
      winnerId: roundResult.winnerId,
    });

    if (roundIndex + 1 >= QUICK_DRAW_CONSTANTS.ROUNDS_PER_MATCH) {
      this.addTimer(setTimeout(() => this.finishMatch(), 2500));
    } else {
      this.addTimer(setTimeout(() => this.startRound(roundIndex + 1), 2500));
    }
  }

  private finishMatch(): void {
    this.phase = 'complete';
    const matchResult = determineMatchWinner(this.allRoundResults, this.playerA, this.playerB);

    this.sendBoth({
      type: 'MATCH_RESULT', matchId: this.matchId,
      winnerId: matchResult.winnerId,
      playerATotalMs: matchResult.playerATotalMs, playerBTotalMs: matchResult.playerBTotalMs,
      roundResults: this.allRoundResults, forfeit: false,
    });
    this.onComplete(this.matchId);
  }

  private sendOpponentProgress(playerId: PlayerId, roundIndex: number, promptIndex: number, done: boolean): void {
    const opponent = playerId === this.playerA ? this.playerB : this.playerA;
    this.send(opponent, {
      type: 'OPPONENT_PROGRESS', matchId: this.matchId,
      roundNumber: roundIndex + 1, promptNumber: promptIndex + 1, done,
    });
  }

  private sendBoth(msg: ServerMessage): void {
    this.send(this.playerA, msg);
    this.send(this.playerB, msg);
  }

  private addTimer(timer: ReturnType<typeof setTimeout>): void {
    this.timers.push(timer);
  }

  private clearAllTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const state of this.playerStates.values()) {
      if (state.delayTimer) clearTimeout(state.delayTimer);
      if (state.timeoutTimer) clearTimeout(state.timeoutTimer);
      state.delayTimer = null;
      state.timeoutTimer = null;
    }
  }
}

function computeTotal(results: PromptResult[]): number {
  let total = 0;
  for (const r of results) {
    const mp = r.missCount * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
    if (r.falseStart) total += QUICK_DRAW_CONSTANTS.FALSE_START_PENALTY_MS;
    else if (r.timedOut) total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS + mp;
    else if (r.hit && r.reactionMs !== null) total += r.reactionMs + mp;
    else total += QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS;
  }
  return total;
}
