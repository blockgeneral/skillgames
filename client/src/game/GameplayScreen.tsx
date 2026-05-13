import { useRef, useCallback } from 'react';
import type { Prompt, PromptResult, SwipeDirection } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';
import type { GameInput, PromptFeedback, PromptStatus } from './types.js';
import { computeRunningTotal } from './scoring.js';

interface Props {
  promptIndex: number;
  subPhase: 'delay' | 'active' | 'feedback';
  prompt: Prompt | null;
  feedbackType?: PromptFeedback;
  results: PromptResult[];
  currentMissCount: number;
  onInput: (input: GameInput) => void;
  tapPosition?: { x: number; y: number };
  opponentPrompt?: number;
}

const COLORS: Record<string, string> = {
  red: '#FF3B3B',
  blue: '#3B82FF',
  green: '#22C55E',
  yellow: '#FACC15',
};

function getPromptStatus(r: PromptResult): PromptStatus {
  if (r.hit) return 'hit';
  if (r.falseStart) return 'false_start';
  if (r.missed) return 'miss';
  if (r.timedOut) return 'timeout';
  return 'upcoming';
}

const STATUS_COLORS: Record<PromptStatus, string> = {
  upcoming: '#333333',
  hit: '#22C55E',
  miss: '#FF3B3B',
  false_start: '#F97316',
  timeout: '#FF3B3B',
};

const ARROW_ROTATION: Record<SwipeDirection, number> = { right: 0, down: 90, left: 180, up: 270 };

export function GameplayScreen({ promptIndex, subPhase, prompt, feedbackType, results, currentMissCount, onInput, tapPosition, opponentPrompt }: Props): JSX.Element {
  const pointerStartRef = useRef<{ nx: number; ny: number; cx: number; cy: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (subPhase === 'feedback') return;

      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;

      // False start on delay
      if (subPhase === 'delay') {
        onInput({ normalizedX: nx, normalizedY: ny, timestamp: performance.now(), isTrusted: e.isTrusted, gestureType: 'false_start' });
        return;
      }

      // Active phase: record start
      pointerStartRef.current = { nx, ny, cx: e.clientX, cy: e.clientY };
    },
    [onInput, subPhase],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (subPhase !== 'active' || !pointerStartRef.current) return;

      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      const timestamp = performance.now();

      const dxPx = e.clientX - start.cx;
      const dyPx = e.clientY - start.cy;
      const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

      if (distPx >= QUICK_DRAW_CONSTANTS.SWIPE_MIN_DISTANCE_PX) {
        let direction: SwipeDirection;
        if (Math.abs(dxPx) > Math.abs(dyPx)) {
          direction = dxPx > 0 ? 'right' : 'left';
        } else {
          direction = dyPx > 0 ? 'down' : 'up';
        }
        onInput({ normalizedX: start.nx, normalizedY: start.ny, timestamp, isTrusted: e.isTrusted, gestureType: 'swipe', swipeDirection: direction });
      } else {
        onInput({ normalizedX: start.nx, normalizedY: start.ny, timestamp, isTrusted: e.isTrusted, gestureType: 'tap' });
      }
    },
    [onInput, subPhase],
  );

  // Build progress dot statuses
  const statuses: PromptStatus[] = [];
  for (let i = 0; i < QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND; i++) {
    statuses.push(i < results.length ? getPromptStatus(results[i]!) : 'upcoming');
  }

  const runningTotalMs = computeRunningTotal(results) + currentMissCount * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
  const isSwipePrompt = prompt?.type === 'swipe';
  const showPrompt = (subPhase === 'active') || (subPhase === 'feedback' && (feedbackType === 'hit' || feedbackType === 'miss'));
  const isSwipeSliding = subPhase === 'feedback' && feedbackType === 'hit' && isSwipePrompt;

  return (
    <div
      className="relative w-full h-full"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{ touchAction: 'none', cursor: subPhase === 'feedback' ? 'default' : 'pointer' }}
    >
      {/* Progress dots */}
      <div className="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
        {statuses.map((status, i) => (
          <div key={i} className="w-3 h-3 rounded-full transition-colors" style={{ backgroundColor: STATUS_COLORS[status] }} />
        ))}
      </div>

      {/* Running timer */}
      <div className="absolute top-4 right-4 text-sm font-mono text-slate-500 z-10">
        {runningTotalMs.toLocaleString()}ms
      </div>

      {/* Prompt index + opponent progress */}
      <div className="absolute top-4 left-4 text-sm font-mono text-slate-600 z-10">
        {promptIndex + 1}/{QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND}
        {opponentPrompt !== undefined && (
          <span className="ml-2 text-xs text-slate-700">opp: {opponentPrompt}/{QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND}</span>
        )}
      </div>

      {/* Shape or Arrow */}
      {showPrompt && prompt && (
        isSwipePrompt
          ? <ArrowRenderer prompt={prompt} slideOff={isSwipeSliding ? prompt.swipeDirection : undefined} />
          : <ShapeRenderer prompt={prompt} flash={subPhase === 'feedback' && feedbackType === 'hit'} />
      )}

      {/* Miss vignette + penalty */}
      {subPhase === 'feedback' && feedbackType === 'miss' && (
        <>
          <div className="absolute inset-0 animate-vignette-red pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-red-400 text-lg font-bold animate-fade-in">+500ms</p>
          </div>
        </>
      )}

      {/* Timeout */}
      {subPhase === 'feedback' && feedbackType === 'timeout' && (
        <>
          <div className="absolute inset-0 animate-vignette-red pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-red-400 text-lg font-bold animate-fade-in">TIMEOUT +2000ms</p>
          </div>
        </>
      )}

      {/* False start */}
      {subPhase === 'feedback' && feedbackType === 'false_start' && (
        <>
          <div className="absolute inset-0 animate-flash-red pointer-events-none" />
          {tapPosition && (
            <div
              className="absolute text-red-500 text-sm font-bold pointer-events-none animate-float-up whitespace-nowrap"
              style={{ left: `${tapPosition.x * 100}%`, top: `${tapPosition.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              TOO EARLY +1000ms
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShapeRenderer({ prompt, flash }: { prompt: Prompt; flash: boolean }): JSX.Element {
  const vmin = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
  const pxSize = prompt.size * vmin;
  const color = COLORS[prompt.color] ?? '#fff';

  return (
    <div
      className={`animate-pop-in ${flash ? 'animate-flash-white' : ''}`}
      style={{ position: 'absolute', left: `${prompt.position.x * 100}%`, top: `${prompt.position.y * 100}%`, transform: 'translate(-50%, -50%) scale(1)' }}
    >
      {prompt.shape === 'circle' && (
        <div style={{ width: pxSize * 2, height: pxSize * 2, borderRadius: '50%', backgroundColor: color }} />
      )}
      {prompt.shape === 'square' && (
        <div style={{ width: pxSize * 2, height: pxSize * 2, backgroundColor: color }} />
      )}
      {prompt.shape === 'triangle' && (
        <svg width={pxSize * 2} height={pxSize * 2} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
          <polygon points="50,6.7 93.3,75 6.7,75" fill={color} />
        </svg>
      )}
    </div>
  );
}

function ArrowRenderer({ prompt, slideOff }: { prompt: Prompt; slideOff?: SwipeDirection }): JSX.Element {
  const vmin = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
  const pxSize = prompt.size * vmin;
  const color = COLORS[prompt.color] ?? '#fff';
  const direction = prompt.swipeDirection ?? 'right';
  const rotation = ARROW_ROTATION[direction];

  const slideClass = slideOff ? `animate-slide-${slideOff}` : '';

  return (
    <div
      className={`animate-pop-in ${slideClass}`}
      style={{ position: 'absolute', left: `${prompt.position.x * 100}%`, top: `${prompt.position.y * 100}%`, transform: 'translate(-50%, -50%) scale(1)' }}
    >
      <svg
        width={pxSize * 2} height={pxSize * 2}
        viewBox="0 0 100 100"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <path
          d="M 25,15 L 75,50 L 25,85"
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
