import type { ReactNode } from 'react';
import type { BallSample, CellDrop, BallEffectId } from './types.js';
import type { NeonPalette } from '@skillgames/shared';

/**
 * Ball effect renderers.
 *
 * Each renderer receives the current ball pixel position, a sliding window of
 * recent ball samples (for trail-anchored effects), any cells recently exited
 * (for drop-anchored effects), the palette, and the cell pixel size.
 *
 * Effects return either defs (filters, gradients) as a fragment and a render
 * node, or just a render node. All effects render in screen space, above the
 * trail layer and below the ball itself.
 */
export interface BallEffectRenderResult {
  /** SVG elements to place in <defs> (gradients, filters). May be empty. */
  defs: ReactNode;
  /** SVG elements to render between trail and ball. */
  nodes: ReactNode;
}

export interface BallEffectProps {
  effect: BallEffectId;
  ballCx: number;
  ballCy: number;
  history: ReadonlyArray<BallSample>;
  drops: ReadonlyArray<CellDrop>;
  cellSize: number;
  wallH: number;
  palette: NeonPalette;
  now: number;
}

export function renderBallEffect(props: BallEffectProps): BallEffectRenderResult {
  switch (props.effect) {
    case 'none':      return { defs: null, nodes: null };
    case 'meteor':    return meteor(props);
    case 'plasma':    return plasma(props);
    case 'lightning': return lightning(props);
    default:          return { defs: null, nodes: null };
  }
}

// ──────────────────────────────────────────────────────────
// Meteor fire tail
// ──────────────────────────────────────────────────────────
function meteor({ ballCx, ballCy, history, cellSize }: BallEffectProps): BallEffectRenderResult {
  if (history.length < 2) return { defs: null, nodes: null };
  // Build a tapered polygon: wide near ball, pointed far away.
  const tail = history.slice(-Math.min(history.length, 12));
  if (tail.length < 2) return { defs: null, nodes: null };
  const widthNear = cellSize * 0.35;
  const points: string[] = [];
  // Top edge of polygon (perpendicular to motion) near-to-far
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i]!;
    const ageFactor = i / (tail.length - 1); // 1 at ball, 0 at tail tip
    const w = widthNear * ageFactor;
    // Estimate direction from neighboring samples
    const prev = tail[Math.max(0, i - 1)]!;
    const next = tail[Math.min(tail.length - 1, i + 1)]!;
    const dx = next.cx - prev.cx;
    const dy = next.cy - prev.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    points.push(`${s.cx + nx * w},${s.cy + ny * w}`);
  }
  // Bottom edge far-to-near
  for (let i = 0; i < tail.length; i++) {
    const s = tail[i]!;
    const ageFactor = i / (tail.length - 1);
    const w = widthNear * ageFactor;
    const prev = tail[Math.max(0, i - 1)]!;
    const next = tail[Math.min(tail.length - 1, i + 1)]!;
    const dx = next.cx - prev.cx;
    const dy = next.cy - prev.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    points.push(`${s.cx - nx * w},${s.cy - ny * w}`);
  }

  return {
    defs: (
      <>
        <linearGradient id="meteor-grad" x1={ballCx} y1={ballCy} x2={tail[0]!.cx} y2={tail[0]!.cy} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="1" />
          <stop offset="20%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#f97316" stopOpacity="0.7" />
          <stop offset="80%" stopColor="#dc2626" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </linearGradient>
        <filter id="meteor-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={cellSize * 0.04} />
        </filter>
      </>
    ),
    nodes: (
      <polygon
        points={points.join(' ')}
        fill="url(#meteor-grad)"
        filter="url(#meteor-blur)"
      />
    ),
  };
}

// ──────────────────────────────────────────────────────────
// Plasma ribbon
// ──────────────────────────────────────────────────────────
function plasma({ history, palette, cellSize, now }: BallEffectProps): BallEffectRenderResult {
  if (history.length < 4) return { defs: null, nodes: null };
  const tail = history.slice(-12);
  const phase = now * 0.008;
  const amplitude = cellSize * 0.15;
  // Construct a path that oscillates perpendicular to the motion
  const topPts: Array<[number, number]> = [];
  const botPts: Array<[number, number]> = [];
  for (let i = 0; i < tail.length; i++) {
    const s = tail[i]!;
    const prev = tail[Math.max(0, i - 1)]!;
    const next = tail[Math.min(tail.length - 1, i + 1)]!;
    const dx = next.cx - prev.cx;
    const dy = next.cy - prev.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const wave = Math.sin(phase + i * 0.8) * amplitude;
    const ageFactor = i / (tail.length - 1);
    const w = cellSize * 0.25 * ageFactor + wave * ageFactor * 0.5;
    topPts.push([s.cx + nx * w, s.cy + ny * w]);
    botPts.push([s.cx - nx * w, s.cy - ny * w]);
  }
  const d = `M ${topPts[0]![0]} ${topPts[0]![1]} ` +
    topPts.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(' ') + ' ' +
    botPts.reverse().map((p) => `L ${p[0]} ${p[1]}`).join(' ') + ' Z';
  return {
    defs: (
      <filter id="plasma-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={cellSize * 0.05} />
      </filter>
    ),
    nodes: <path d={d} fill={palette.trail} opacity="0.6" filter="url(#plasma-blur)" />,
  };
}

// ──────────────────────────────────────────────────────────
// Lightning arc
// ──────────────────────────────────────────────────────────
function lightning({ history, palette, cellSize, now }: BallEffectProps): BallEffectRenderResult {
  if (history.length < 3) return { defs: null, nodes: null };
  // Pick 4 anchor points along history, jitter them
  const n = 5;
  const anchors: Array<[number, number]> = [];
  const tail = history.slice(-Math.min(history.length, 15));
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / (n - 1)) * (tail.length - 1));
    const s = tail[idx]!;
    // Jitter seeded by (now, i) for flicker
    const jitterSeed = Math.sin(now * 0.04 + i * 1.7) * cellSize * 0.15;
    const jitterSeed2 = Math.cos(now * 0.04 + i * 2.3) * cellSize * 0.15;
    anchors.push([s.cx + jitterSeed, s.cy + jitterSeed2]);
  }
  const d = `M ${anchors[0]![0]} ${anchors[0]![1]} ` +
    anchors.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(' ');
  return {
    defs: (
      <filter id="lightning-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={cellSize * 0.06} />
      </filter>
    ),
    nodes: (
      <>
        <path d={d} fill="none" stroke={palette.trail} strokeWidth={cellSize * 0.14} opacity="0.6" filter="url(#lightning-glow)" />
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={cellSize * 0.05} opacity="0.95" />
      </>
    ),
  };
}
