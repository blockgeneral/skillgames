import { useState, useRef, useEffect, useCallback } from 'react';
import type { Prompt } from '@skillgamez/shared';
import { isTapOnTarget } from '@skillgamez/shared';

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
  { shape: 'circle', color: 'red', position: { x: 0.5, y: 0.5 }, size: 0.12 },
  { shape: 'square', color: 'blue', position: { x: 0.3, y: 0.4 }, size: 0.12 },
  { shape: 'triangle', color: 'green', position: { x: 0.7, y: 0.6 }, size: 0.12 },
  { shape: 'circle', color: 'yellow', position: { x: 0.4, y: 0.7 }, size: 0.12 },
];
const PRACTICE_DELAYS = [1200, 700, 600, 800];

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

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const startPractice = useCallback(() => {
    setPhase({ kind: 'practice_delay', promptIndex: 0 });
    timerRef.current = setTimeout(() => {
      const now = performance.now();
      tappedRef.current = false;
      setPhase({ kind: 'practice_active', promptIndex: 0, appearedAt: now });
    }, PRACTICE_DELAYS[0]!);
  }, []);

  const advancePractice = useCallback((promptIndex: number, reactionMs: number | null) => {
    if (reactionMs !== null) {
      setReactionTimes(prev => [...prev, reactionMs]);
    }
    const next = promptIndex + 1;
    if (next >= PRACTICE_PROMPTS.length) {
      // Compute average from collected times + this one
      setReactionTimes(prev => {
        const all = reactionMs !== null ? [...prev, reactionMs] : prev;
        const avg = all.length > 0 ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
        // Use a timeout to set phase to avoid setting state during render
        setTimeout(() => setPhase({ kind: 'done', avgMs: avg }), 0);
        return all;
      });
      return;
    }
    setPhase({ kind: 'practice_delay', promptIndex: next });
    timerRef.current = setTimeout(() => {
      const now = performance.now();
      tappedRef.current = false;
      setPhase({ kind: 'practice_active', promptIndex: next, appearedAt: now });
    }, PRACTICE_DELAYS[next]!);
  }, []);

  const handlePracticeTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (phase.kind !== 'practice_active') return;
    if (tappedRef.current) return;
    tappedRef.current = true;

    const timestamp = performance.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const prompt = PRACTICE_PROMPTS[phase.promptIndex]!;
    const hit = isTapOnTarget({ x: nx, y: ny }, prompt);
    const reactionMs = hit ? Math.round(timestamp - phase.appearedAt) : null;

    setPhase({ kind: 'practice_feedback', promptIndex: phase.promptIndex, reactionMs, hit });
    timerRef.current = setTimeout(() => {
      advancePractice(phase.promptIndex, reactionMs);
    }, 400);
  }, [phase, advancePractice]);

  // ─── Card rendering ─────────────────────────────────────────────────
  if (phase.kind === 'card') {
    const cards = [
      {
        title: 'Tap the shapes',
        body: 'Shapes will appear on screen. Tap them as fast as you can!',
        shape: 'circle' as const,
        color: '#FF3B3B',
      },
      {
        title: "Don't tap early",
        body: "Wait for the shape to appear, or you get a +1000ms penalty!",
        shape: 'square' as const,
        color: '#F97316',
      },
      {
        title: '8 per round, 3 rounds',
        body: '8 shapes per round. 3 rounds per match. Fastest total time wins!',
        shape: 'triangle' as const,
        color: '#22C55E',
      },
      {
        title: "Let's practice!",
        body: 'Tap 4 shapes as fast as you can. No pressure — just a warm-up.',
        shape: null,
        color: null,
      },
    ];

    const card = cards[phase.index]!;
    const isLast = phase.index === cards.length - 1;

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
        <div className="w-full max-w-xs bg-slate-900/80 rounded-2xl p-8 flex flex-col items-center gap-6 border border-slate-800">
          {/* Shape illustration */}
          {card.shape && (
            <div className="w-16 h-16 flex items-center justify-center">
              {card.shape === 'circle' && (
                <div className="w-14 h-14 rounded-full" style={{ backgroundColor: card.color! }} />
              )}
              {card.shape === 'square' && (
                <div className="w-14 h-14" style={{ backgroundColor: card.color! }} />
              )}
              {card.shape === 'triangle' && (
                <svg width={56} height={56} viewBox="0 0 100 100">
                  <polygon points="50,6.7 93.3,75 6.7,75" fill={card.color!} />
                </svg>
              )}
            </div>
          )}
          {!card.shape && (
            <div className="text-4xl">🎯</div>
          )}

          <h2 className="text-xl font-bold text-white text-center">{card.title}</h2>
          <p className="text-sm text-slate-400 text-center leading-relaxed">{card.body}</p>

          {/* Dots indicator */}
          <div className="flex gap-2">
            {cards.map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: i === phase.index ? '#22D3EE' : '#334155' }}
              />
            ))}
          </div>

          <button
            onPointerDown={() => {
              if (isLast) startPractice();
              else setPhase({ kind: 'card', index: phase.index + 1 });
            }}
            className={`w-full py-3 rounded-xl font-bold text-sm tracking-wider transition-colors ${
              isLast
                ? 'bg-cyan-500 text-black active:bg-cyan-400'
                : 'bg-slate-800 text-slate-300 active:bg-slate-700'
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
    const pIdx = phase.kind === 'practice_delay' ? phase.promptIndex
      : phase.kind === 'practice_active' ? phase.promptIndex
      : phase.promptIndex;
    const prompt = PRACTICE_PROMPTS[pIdx]!;
    const showShape = phase.kind === 'practice_active' || (phase.kind === 'practice_feedback' && phase.hit);

    return (
      <div
        className="relative w-full h-full"
        onPointerDown={handlePracticeTap}
        style={{ touchAction: 'none', cursor: 'pointer' }}
      >
        {/* Practice progress */}
        <div className="absolute top-4 left-0 right-0 flex justify-center gap-2 z-10">
          {PRACTICE_PROMPTS.map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: i < reactionTimes.length ? '#22C55E'
                  : i === pIdx && phase.kind === 'practice_feedback' ? (phase.hit ? '#22C55E' : '#FF3B3B')
                  : '#333',
              }}
            />
          ))}
        </div>

        <p className="absolute top-4 left-4 text-sm text-slate-600 font-mono z-10">
          PRACTICE
        </p>

        {showShape && (
          <PracticeShape prompt={prompt} flash={phase.kind === 'practice_feedback' && phase.hit} />
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

  // ─── Done rendering ─────────────────────────────────────────────────
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
    <div
      className={`animate-pop-in ${flash ? 'animate-flash-white' : ''}`}
      style={{
        position: 'absolute',
        left: `${prompt.position.x * 100}%`,
        top: `${prompt.position.y * 100}%`,
        transform: 'translate(-50%, -50%) scale(1)',
      }}
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
