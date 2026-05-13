import { describe, it, expect } from 'vitest';
import type { PlayerId, MatchId, Timestamp, WagerAmount } from '@skillgamez/shared';
import type { ServerMessage } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';
import { QuickDrawSession } from '../game/QuickDrawSession.js';
import type { ActiveMatch } from '../match/MatchRegistry.js';

const PLAYER_A = 'tg:1' as PlayerId;
const PLAYER_B = 'tg:2' as PlayerId;
const MATCH_ID = 'test-match-1' as MatchId;

function makeMatch(): ActiveMatch {
  return {
    matchId: MATCH_ID, playerA: PLAYER_A, playerB: PLAYER_B,
    wagerAmount: 1 as WagerAmount, status: 'waiting_for_deposits',
    createdAt: Date.now() as Timestamp, seed: 'test-seed-for-session-123',
  };
}

interface ML { playerId: PlayerId; msg: ServerMessage }

function createSession() {
  const messages: ML[] = [];
  let completed = false;
  const session = new QuickDrawSession(
    makeMatch(),
    (pid, msg) => messages.push({ playerId: pid, msg }),
    () => { completed = true; },
  );
  return { session, messages, isCompleted: () => completed };
}

function msgs(log: ML[], type: string, pid?: PlayerId): ServerMessage[] {
  return log.filter(m => m.msg.type === type && (!pid || m.playerId === pid)).map(m => m.msg);
}

async function waitFor(
  log: ML[], type: string, pid: PlayerId | undefined, timeout = 10000,
): Promise<ServerMessage> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = msgs(log, type, pid);
    if (found.length > 0) return found[found.length - 1]!;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for ${type}${pid ? ` for ${pid}` : ''}`);
}

describe('QuickDrawSession', () => {
  it('starts in waiting_for_ready', () => {
    const { session } = createSession();
    expect(session.currentPhase).toBe('waiting_for_ready');
    session.destroy();
  });

  it('first ready → WAITING_FOR_OPPONENT_READY', () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    expect(msgs(messages, 'WAITING_FOR_OPPONENT_READY', PLAYER_A)).toHaveLength(1);
    session.destroy();
  });

  it('both ready → BOTH_READY + countdown', () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);
    expect(msgs(messages, 'BOTH_READY')).toHaveLength(2);
    expect(msgs(messages, 'COUNTDOWN').length).toBeGreaterThanOrEqual(2);
    session.destroy();
  });

  it('countdown delivers 3,2,1,go then ROUND_START', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    await waitFor(messages, 'ROUND_START', PLAYER_A);
    const steps = msgs(messages, 'COUNTDOWN').map(m => (m as { step: string }).step);
    expect(steps).toContain('3');
    expect(steps).toContain('go');
    expect(msgs(messages, 'ROUND_START')).toHaveLength(2);
    session.destroy();
  });

  it('prompts are delivered after round starts', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    await waitFor(messages, 'PROMPT_SHOW', PLAYER_A);
    expect(msgs(messages, 'PROMPT_SHOW', PLAYER_A).length).toBeGreaterThanOrEqual(1);
    session.destroy();
  });

  it('valid tap hit → PROMPT_RESULT hit=true', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    const promptMsg = await waitFor(messages, 'PROMPT_SHOW', PLAYER_A) as {
      prompt: { type: string; position: { x: number; y: number }; swipeDirection?: string };
      roundNumber: number; promptNumber: number;
    };

    // Wait to ensure reaction time exceeds 120ms floor
    await new Promise(r => setTimeout(r, 150));

    if (promptMsg.prompt.type === 'tap') {
      session.handleInput(PLAYER_A, {
        type: 'tap', roundNumber: promptMsg.roundNumber, promptNumber: promptMsg.promptNumber,
        x: promptMsg.prompt.position.x, y: promptMsg.prompt.position.y,
        timestamp: Date.now(), isTrusted: true,
      });
    } else {
      session.handleInput(PLAYER_A, {
        type: 'swipe', roundNumber: promptMsg.roundNumber, promptNumber: promptMsg.promptNumber,
        swipeDirection: promptMsg.prompt.swipeDirection as import('@skillgamez/shared').SwipeDirection,
        timestamp: Date.now(), isTrusted: true,
      });
    }

    const results = msgs(messages, 'PROMPT_RESULT', PLAYER_A);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const last = results[results.length - 1] as { hit: boolean; reactionMs: number | null };
    expect(last.hit).toBe(true);
    expect(last.reactionMs).toBeGreaterThan(0);

    expect(msgs(messages, 'OPPONENT_PROGRESS', PLAYER_B).length).toBeGreaterThanOrEqual(1);
    session.destroy();
  });

  it('miss tap → prompt stays active', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    await waitFor(messages, 'PROMPT_SHOW', PLAYER_A);
    const promptsBefore = msgs(messages, 'PROMPT_SHOW', PLAYER_A).length;

    const prompt = msgs(messages, 'PROMPT_SHOW', PLAYER_A)[0] as { roundNumber: number; promptNumber: number };
    session.handleInput(PLAYER_A, {
      type: 'tap', roundNumber: prompt.roundNumber, promptNumber: prompt.promptNumber,
      x: 0.01, y: 0.01, timestamp: Date.now(), isTrusted: true,
    });

    const missResults = msgs(messages, 'PROMPT_RESULT', PLAYER_A).filter(r => !(r as { hit: boolean }).hit);
    expect(missResults.length).toBeGreaterThanOrEqual(1);
    expect(msgs(messages, 'PROMPT_SHOW', PLAYER_A).length).toBe(promptsBefore);
    session.destroy();
  });

  it('timeout after 2s → PROMPT_RESULT', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    await waitFor(messages, 'PROMPT_SHOW', PLAYER_A);

    // Wait for timeout (2s + buffer)
    await new Promise(r => setTimeout(r, QUICK_DRAW_CONSTANTS.REACTION_CEILING_MS + 200));

    const results = msgs(messages, 'PROMPT_RESULT', PLAYER_A);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const timeout = results.find(r => (r as { reactionMs: number | null }).reactionMs === null);
    expect(timeout).toBeDefined();
    session.destroy();
  });

  it('wrong prompt number → rejected (no PROMPT_RESULT)', async () => {
    const { session, messages } = createSession();
    session.handleReady(PLAYER_A);
    session.handleReady(PLAYER_B);

    await waitFor(messages, 'PROMPT_SHOW', PLAYER_A);
    const resultsBefore = msgs(messages, 'PROMPT_RESULT', PLAYER_A).length;

    session.handleInput(PLAYER_A, {
      type: 'tap', roundNumber: 1, promptNumber: 99,
      x: 0.5, y: 0.5, timestamp: Date.now(), isTrusted: true,
    });

    // No new result should be added synchronously
    const resultsAfter = msgs(messages, 'PROMPT_RESULT', PLAYER_A).length;
    expect(resultsAfter).toBe(resultsBefore);
    session.destroy();
  });
});
