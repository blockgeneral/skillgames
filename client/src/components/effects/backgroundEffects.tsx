import type { ReactNode } from 'react';
import type { BackgroundEffectId, WallTheme } from './types.js';
import { DEFAULT_WALL_THEME } from './types.js';

/**
 * Background effect renderers.
 *
 * Each effect produces a <pattern> definition (id "bg-pattern") that the
 * MazeRenderer paints across the entire wall region as a low-opacity overlay.
 * Walls themselves always use DEFAULT_WALL_THEME (solid dark slate).
 */
export interface BackgroundEffectRenderResult {
  /** Pattern/filter definitions for <defs> */
  defs: ReactNode;
  /** Wall theme — always DEFAULT_WALL_THEME; kept for API stability. */
  theme: WallTheme;
}

export interface BackgroundEffectProps {
  effect: BackgroundEffectId;
  now: number;
}

export function renderBackgroundEffect({ effect, now }: BackgroundEffectProps): BackgroundEffectRenderResult {
  switch (effect) {
    case 'none':  return { defs: null, theme: DEFAULT_WALL_THEME };
    case 'space': return space(now);
    default:      return { defs: null, theme: DEFAULT_WALL_THEME };
  }
}

// ──────────────────────────────────────────────────────────
// Deep space — starfield + galaxies
// ──────────────────────────────────────────────────────────
function space(now: number): BackgroundEffectRenderResult {
  const drift = (now * 0.003) % 200;
  // Deterministic star positions via simple pseudorandom
  const stars = [];
  for (let i = 0; i < 60; i++) {
    const x = ((i * 1237) % 200) + 0;
    const y = ((i * 6421) % 200) + 0;
    const r = 0.3 + ((i * 17) % 10) * 0.08;
    const opacity = 0.3 + ((i * 23) % 10) * 0.07;
    const phase = (i * 1.3) % (Math.PI * 2);
    const twinkle = 0.5 + 0.5 * Math.sin(now * 0.003 + phase);
    stars.push(
      <circle
        key={`s-${i}`}
        cx={x}
        cy={y}
        r={r}
        fill="#e0e7ff"
        opacity={opacity * twinkle}
      />
    );
  }
  return {
    defs: (
      <>
        <radialGradient id="space-galaxy1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#6d28d9" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="space-galaxy2">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.25" />
          <stop offset="60%" stopColor="#1e40af" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#0c1e4d" stopOpacity="0" />
        </radialGradient>
        <pattern id="bg-pattern" x={-drift} y="0" width="200" height="200" patternUnits="userSpaceOnUse">
          <rect width="200" height="200" fill="#050a1a" />
          <ellipse cx="55" cy="70" rx="35" ry="18" fill="url(#space-galaxy1)" />
          <ellipse cx="150" cy="140" rx="28" ry="14" fill="url(#space-galaxy2)" />
          {stars}
        </pattern>
      </>
    ),
    theme: DEFAULT_WALL_THEME,
  };
}
