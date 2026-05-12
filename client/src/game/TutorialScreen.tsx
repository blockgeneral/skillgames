import { useState, useRef, useEffect, useCallback } from 'react';
import type { Prompt, SwipeDirection } from '@skillgamez/shared';
import { isTapOnTarget, QUICK_DRAW_CONSTANTS } from '@skillgamez/shared';

interface Props {
  onComplete: () => void;
}

const COLORS: Record<string, string> = {
  red: '#FF3B3B',
  blue: '#3B82FF',
  green: '#22C55E',
  yellow: '#FACC15',
};

const PRACTICE_PROMPTS: Prompt[] = [
  { type: 'tap', shape: 'circle', color: 'red', position: { x: 0.5, y: 0.5 }, size: 0.12 },
  { type: 'tap', shape: 'square', color: 'blue', position: { x: 0.3, y: 0.4 }, size: 0.12 },
  { type: 'swipe', shape: 'circle', color: 'green', position: { x: 0.6, y: 0.5 }, size: 0.12, swipeDirection: 'right' },
  { type: 'tap', shape: 'triangle', color: 'yellow', position: { x: 0.4, y: 0.6 }, size: 0.12 },
  { type: 'swipe', shape: 'circle', color: 'red', position: { x: 0.5, y: 0.4 }, size: 0.12, swipeDirection: 'up' },
];
const PRACTICE_DELAYS = [1200, 700, 600, 800, 700];

type TutorialPhase =
  | { kind: 'card'; index: number }
  | { kind: 'practice_delay'; promptIndex: number }
  | { kind: 'practice_active'; promptIndex: number; appearedAt: number }
  | { kind: 'practice_feedback'; promptIndex: number; reactionMs: number | null; hit: boolean }
  | { kind: 'done'; avgMs: number };

export function TutorialScreen({ onComplete }: Props): JSX.Element {
  const [phase, setPhase] = useState<TutorialPhase>({ kind: 'card', index: 0 });
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const tappedRef = useRef(false);
  const pointerStartRef = useRef<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const startPractice = useCallback(() => {
    setPhase({ kind: 'practice_delay', promptIndex: 0 });
    timerRef.current = setTimeout(() => {
      tappedRef.current = false;
      setPhase({ kind: 'practice_active', promptIndex: 0, appearedAt: performance.now() });
    }, PRACTICE_DELAYS[0]!);
  }, []);

  const advancePractice = useCallback((promptIndex: number, reactionMs: number | null) => {
    const next = promptIndex + 1;
    if (next >= PRACTICE_PROMPTS.length) {
      const all = reactionMs !== null ? [...reactionTimes, reactionMs] : [...reactionTimes];
      const avg = all.length > 0 ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
      setReactionTimes(all);
      setPhase({ kind: 'done', avgMs: avg });
      return;
    }
    if (reactionMs !== null) setReactionTimes(prev => [...prev, reactionMs]);
    setPhase({ kind: 'practice_delay', promptIndex: next });
    timerRef.current = setTimeout(() => {
      tappedRef.current = false;
      setPhase({ kind: 'practice_active', promptIndex: next, appearedAt: performance.now() });
    }, PRACTICE_DELAYS[next]!);
  }, [reactionTimes]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (phase.kind !== 'practice_active') return;
    if (tappedRef.current) return;
    pointerStartRef.current = { cx: e.clientX, cy: e.clientY };
  }, [phase]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (phase.kind !== 'practice_active' || !pointerStartRef.current) return;
    if (tappedRef.current) return;
    tappedRef.current = true;

    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    const timestamp = performance.now();
    const prompt = PRACTICE_PROMPTS[phase.promptIndex]!;

    const dxPx = e.clientX - start.cx;
    const dyPx = e.clientY - start.cy;
    const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

    let hit = false;
    if (prompt.type === 'tap') {
      if (distPx < QUICK_DRAW_CONSTANTS.SWIPE_MIN_DISTANCE_PX) {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (start.cx - rect.left) / rect.width;
        const ny = (start.cy - rect.top) / rect.height;
        hit = isTapOnTarget({ x: nx, y: ny }, prompt);
      }
    } else if (prompt.type === 'swipe' && prompt.swipeDirection) {
      if (distPx >= QUICK_DRAW_CONSTANTS.SWIPE_MIN_DISTANCE_PX) {
        let dir: SwipeDirection;
        if (Math.abs(dxPx) > Math.abs(dyPx)) { dir = dxPx > 0 ? 'right' : 'left'; }
        else { dir = dyPx > 0 ? 'down' : 'up'; }
        hit = dir === prompt.swipeDirection;
      }
    }

    const reactionMs = hit ? Math.round(timestamp - phase.appearedAt) : null;
    setPhase({ kind: 'practice_feedback', promptIndex: phase.promptIndex, reactionMs, hit });
    timerRef.current = setTimeout(() => {
      advancePractice(phase.promptIndex, reactionMs);
    }, 400);
  }, [phase, advancePractice]);

  // ─── Card rendering ─────────────────────────────────────────────────
  if (phase.kind === 'card') {
    const cards = [
      { title: 'Tap the shapes', body: 'Shapes will appear on screen. Tap them as fast as you can!', illustration: 'circle' as const },
      { title: "Don't tap early", body: 'Wait for the shape to appear, or you get a +1000ms penalty!', illustration: 'square' as const },
      { title: 'Swipe the arrows', body: 'See an arrow? Swipe in that direction! Wrong direction = penalty.', illustration: 'arrow' as const },
      { title: '8 per round, 3 rounds', body: '8 shapes per round. 3 rounds per match. Fastest total time wins!', illustration: 'triangle' as const },
      { title: "Let's practice!", body: "Tap shapes and swipe arrows. No pressure \u2014 just a warm-up.", illustration: null },
    ];

    const card = cards[phase.index]!;
    const isLast = phase.index === cards.length - 1;

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
        <div className="w-full max-w-xs bg-slate-900/80 rounded-2xl p-8 flex flex-col items-center gap-6 border border-slate-800">
          {card.illustration && (
            <div className="w-16 h-16 flex items-center justify-center">
              {card.illustration === 'circle' && <div className="w-14 h-14 rounded-full" style={{ backgroundColor: '#FF3B3B' }} />}
              {card.illustration === 'square' && <div className="w-14 h-14" style={{ backgroundColor: '#F97316' }} />}
              {card.illustration === 'triangle' && (
                <svg width={56} height={56} viewBox="0 0 100 100"><polygon points="50,6.7 93.3,75 6.7,75" fill="#22C55E" /></svg>
              )}
              {card.illustration === 'arrow' && (
                <svg width={56} height={56} viewBox="0 0 100 100">
                  <path d="M 25,15 L 75,50 L 25,85" stroke="#3B82FF" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          )}
          {!card.illustration && <div className="text-4xl">{'\uD83C\uDFAF'}</div>}

          <h2 className="text-xl font-bold text-white text-center">{card.title}</h2>
          <p className="text-sm text-slate-400 text-center leading-relaxed">{card.body}</p>

          <div className="flex gap-2">
            {cards.map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: i === phase.index ? '#22D3EE' : '#334155' }} />
            ))}
          </div>

          <button
            onPointerDown={() => { if (isLast) startPractice(); else setPhase({ kind: 'card', index: phase.index + 1 }); }}
            className={`w-full py-3 rounded-xl font-bold text-sm tracking-wider transition-colors ${
              isLast ? 'bg-cyan-500 text-black active:bg-cyan-400' : 'bg-slate-800 text-slate-300 active:bg-slate-700'
            }`}
          >
            {isLast ? 'PRACTICE' : 'NEXT'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Practice rendering ─────────────────────────────────────────────
  if (phase.kind === 'practice_delay' || phase.kind === 'practice_active' || phase.kind === 'practice_feedback') {
    const pIdx = phase.promptIndex;
    const prompt = PRACTICE_PROMPTS[pIdx]!;
    const showPrompt = phase.kind === 'practice_active' || (phase.kind === 'practice_feedback' && phase.hit);
    const isSwipe = prompt.type === 'swipe';

    return (
      <div
        className="relative w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none', cursor: 'pointer' }}
      >
        <div className="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
          {PRACTICE_PROMPTS.map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full" style={{
              backgroundColor: i < reactionTimes.length ? '#22C55E'
                : i === pIdx && phase.kind === 'practice_feedback' ? (phase.hit ? '#22C55E' : '#FF3B3B')
                : '#333',
            }} />
          ))}
        </div>

        <p className="absolute top-4 left-4 text-sm text-slate-600 font-mono z-10">PRACTICE</p>

        {showPrompt && (
          isSwipe
            ? <PracticeArrow prompt={prompt} slideOff={phase.kind === 'practice_feedback' && phase.hit ? prompt.swipeDirection : undefined} />
            : <PracticeShape prompt={prompt} flash={phase.kind === 'practice_feedback' && phase.hit} />
        )}

        {phase.kind === 'practice_feedback' && phase.reactionMs !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-3xl font-mono text-green-400 animate-fade-in">{phase.reactionMs}ms</p>
          </div>
        )}
        {phase.kind === 'practice_feedback' && !phase.hit && (
          <div className="absolute inset-0 animate-vignette-red pointer-events-none" />
        )}
      </div>
    );
  }

  // ─── Done ───────────────────────────────────────────────────────────
  if (phase.kind === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 px-6 animate-fade-in">
        <p className="text-2xl font-bold text-white">Nice!</p>
        <div className="text-center">
          <p className="text-sm text-slate-400">Your average</p>
          <p className="text-5xl font-mono text-cyan-400 mt-2">{phase.avgMs}ms</p>
        </div>
        <p className="text-sm text-slate-500">Ready to play for real?</p>
        <button
          onPointerDown={onComplete}
          className="w-full max-w-xs py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors"
        >
          LET'S GO
        </button>
      </div>
    );
  }

  return <div />;
}

function PracticeShape({ prompt, flash }: { prompt: Prompt; flash: boolean }): JSX.Element {
  const vmin = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
  const pxSize = prompt.size * vmin;
  const color = COLORS[prompt.color] ?? '#fff';

  return (
    <div className={`animate-pop-in ${flash ? 'animate-flash-white' : ''}`}
      style={{ position: 'absolute', left: `${prompt.position.x * 100}%`, top: `${prompt.position.y * 100}%`, transform: 'translate(-50%, -50%) scale(1)' }}>
      {prompt.shape === 'circle' && <div style={{ width: pxSize * 2, height: pxSize * 2, borderRadius: '50%', backgroundColor: color }} />}
      {prompt.shape === 'square' && <div style={{ width: pxSize * 2, height: pxSize * 2, backgroundColor: color }} />}
      {prompt.shape === 'triangle' && (
        <svg width={pxSize * 2} height={pxSize * 2} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
          <polygon points="50,6.7 93.3,75 6.7,75" fill={color} />
        </svg>
      )}
    </div>
  );
}

const ARROW_ROTATION: Record<string, number> = { right: 0, down: 90, left: 180, up: 270 };

function PracticeArrow({ prompt, slideOff }: { prompt: Prompt; slideOff?: SwipeDirection }): JSX.Element {
  const vmin = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
  const pxSize = prompt.size * vmin;
  const color = COLORS[prompt.color] ?? '#fff';
  const direction = prompt.swipeDirection ?? 'right';
  const slideClass = slideOff ? `animate-slide-${slideOff}` : '';

  return (
    <div className={`animate-pop-in ${slideClass}`}
      style={{ position: 'absolute', left: `${prompt.position.x * 100}%`, top: `${prompt.position.y * 100}%`, transform: 'translate(-50%, -50%) scale(1)' }}>
      <svg width={pxSize * 2} height={pxSize * 2} viewBox="0 0 100 100" style={{ transform: `rotate(${ARROW_ROTATION[direction]}deg)` }}>
        <path d="M 25,15 L 75,50 L 25,85" stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
