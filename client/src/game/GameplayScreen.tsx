import { useCallback } from 'react';
import type { Prompt, PromptResult } from '@skillgamez/shared';
import { QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';
import type { PromptFeedback, PromptStatus } from './types.js';
import { computeRunningTotal } from './scoring.js';

interface Props {
  promptIndex: number;
  subPhase: 'delay' | 'active' | 'feedback';
  prompt: Prompt | null;
  feedbackType?: PromptFeedback;
  results: PromptResult[];
  currentMissCount: number;
  onTap: (normalizedX: number, normalizedY: number, timestamp: number, isTrusted: boolean) => void;
  tapPosition?: { x: number; y: number };
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

function formatTime(ms: number): string {
  return ms.toLocaleString();
}

export function GameplayScreen({ promptIndex, subPhase, prompt, feedbackType, results, currentMissCount, onTap, tapPosition }: Props): JSX.Element {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (subPhase === 'feedback') return;
      const timestamp = performance.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const normalizedX = (e.clientX - rect.left) / rect.width;
      const normalizedY = (e.clientY - rect.top) / rect.height;
      onTap(normalizedX, normalizedY, timestamp, e.isTrusted);
    },
    [onTap, subPhase],
  );

  // Build progress dot statuses
  const statuses: PromptStatus[] = [];
  for (let i = 0; i < QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND; i++) {
    if (i < results.length) {
      statuses.push(getPromptStatus(results[i]!));
    } else {
      statuses.push('upcoming');
    }
  }

  const runningTotalMs = computeRunningTotal(results) + currentMissCount * QUICK_DRAW_CONSTANTS.MISS_PENALTY_MS;
  // Show shape during active, hit feedback, AND miss feedback (player needs to re-tap)
  const showShape = (subPhase === 'active') || (subPhase === 'feedback' && (feedbackType === 'hit' || feedbackType === 'miss'));

  return (
    <div
      className="relative w-full h-full"
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none', cursor: subPhase === 'feedback' ? 'default' : 'pointer' }}
    >
      {/* Progress dots */}
      <div className="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
        {statuses.map((status, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-colors"
            style={{ backgroundColor: STATUS_COLORS[status] }}
          />
        ))}
      </div>

      {/* Running timer */}
      <div className="absolute top-4 right-4 text-sm font-mono text-slate-500 z-10">
        {formatTime(runningTotalMs)}ms
      </div>

      {/* Prompt index hint */}
      <div className="absolute top-4 left-4 text-sm font-mono text-slate-600 z-10">
        {promptIndex + 1}/{QUICK_DRAW_CONSTANTS.PROMPTS_PER_ROUND}
      </div>

      {/* Shape */}
      {showShape && prompt && (
        <ShapeRenderer
          prompt={prompt}
          flash={subPhase === 'feedback' && feedbackType === 'hit'}
        />
      )}

      {/* Miss vignette + penalty text */}
      {subPhase === 'feedback' && feedbackType === 'miss' && (
        <>
          <div className="absolute inset-0 animate-vignette-red pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-red-400 text-lg font-bold animate-fade-in">+500ms</p>
          </div>
        </>
      )}

      {/* Timeout vignette + text */}
      {subPhase === 'feedback' && feedbackType === 'timeout' && (
        <>
          <div className="absolute inset-0 animate-vignette-red pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-red-400 text-lg font-bold animate-fade-in">TIMEOUT +2000ms</p>
          </div>
        </>
      )}

      {/* False start flash + text */}
      {subPhase === 'feedback' && feedbackType === 'false_start' && (
        <>
          <div className="absolute inset-0 animate-flash-red pointer-events-none" />
          {tapPosition && (
            <div
              className="absolute text-red-500 text-sm font-bold pointer-events-none animate-float-up whitespace-nowrap"
              style={{
                left: `${tapPosition.x * 100}%`,
                top: `${tapPosition.y * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
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

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${prompt.position.x * 100}%`,
    top: `${prompt.position.y * 100}%`,
    transform: 'translate(-50%, -50%) scale(1)',
  };

  return (
    <div className={`animate-pop-in ${flash ? 'animate-flash-white' : ''}`} style={style}>
      {prompt.shape === 'circle' && (
        <div style={{
          width: pxSize * 2, height: pxSize * 2,
          borderRadius: '50%', backgroundColor: color,
        }} />
      )}
      {prompt.shape === 'square' && (
        <div style={{
          width: pxSize * 2, height: pxSize * 2,
          backgroundColor: color,
        }} />
      )}
      {prompt.shape === 'triangle' && (
        <svg
          width={pxSize * 2} height={pxSize * 2}
          viewBox="0 0 100 100"
          style={{ overflow: 'visible' }}
        >
          <polygon points="50,6.7 93.3,75 6.7,75" fill={color} />
        </svg>
      )}
    </div>
  );
}
