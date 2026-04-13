import type { Seed } from './types.js';

/**
 * A neon color palette used to theme a single match.
 * Both opponents see the same palette (derived deterministically from the match seed)
 * so visual identity is shared and verifiable.
 */
export interface NeonPalette {
  /** Human-readable palette name (for debugging / logging) */
  readonly name: string;
  /** Painted-cell gradient stop 1 (brighter) */
  readonly paint1: string;
  /** Painted-cell gradient stop 2 (darker) */
  readonly paint2: string;
  /** Trail glow color, used at full opacity then faded by renderer */
  readonly trail: string;
}

/**
 * Twenty neon palettes spanning the hue wheel. Picked to read as a single
 * coherent neon aesthetic regardless of which one is selected.
 *
 * If you add or reorder entries, existing seeds will map to different colors —
 * acceptable in development, but freeze before any persistent match history exists.
 */
export const NEON_PALETTES: ReadonlyArray<NeonPalette> = [
  { name: 'cyan',     paint1: '#22d3ee', paint2: '#0891b2', trail: '#67e8f9' },
  { name: 'magenta',  paint1: '#e879f9', paint2: '#c026d3', trail: '#f0abfc' },
  { name: 'lime',     paint1: '#a3e635', paint2: '#65a30d', trail: '#bef264' },
  { name: 'orange',   paint1: '#fb923c', paint2: '#ea580c', trail: '#fdba74' },
  { name: 'pink',     paint1: '#ec4899', paint2: '#be185d', trail: '#f9a8d4' },
  { name: 'violet',   paint1: '#a78bfa', paint2: '#7c3aed', trail: '#c4b5fd' },
  { name: 'emerald',  paint1: '#34d399', paint2: '#059669', trail: '#6ee7b7' },
  { name: 'amber',    paint1: '#fbbf24', paint2: '#d97706', trail: '#fcd34d' },
  { name: 'sky',      paint1: '#38bdf8', paint2: '#0284c7', trail: '#7dd3fc' },
  { name: 'rose',     paint1: '#fb7185', paint2: '#e11d48', trail: '#fda4af' },
  { name: 'teal',     paint1: '#2dd4bf', paint2: '#0d9488', trail: '#5eead4' },
  { name: 'indigo',   paint1: '#818cf8', paint2: '#4f46e5', trail: '#a5b4fc' },
  { name: 'fuchsia',  paint1: '#d946ef', paint2: '#a21caf', trail: '#f5d0fe' },
  { name: 'red',      paint1: '#f87171', paint2: '#dc2626', trail: '#fca5a5' },
  { name: 'green',    paint1: '#4ade80', paint2: '#16a34a', trail: '#86efac' },
  { name: 'yellow',   paint1: '#facc15', paint2: '#ca8a04', trail: '#fde047' },
  { name: 'blue',     paint1: '#60a5fa', paint2: '#2563eb', trail: '#93c5fd' },
  { name: 'purple',   paint1: '#c084fc', paint2: '#9333ea', trail: '#d8b4fe' },
  { name: 'mint',     paint1: '#6ee7b7', paint2: '#10b981', trail: '#a7f3d0' },
  { name: 'coral',    paint1: '#ff7e5f', paint2: '#e94f37', trail: '#ffa48a' },
];

/**
 * Deterministically derives a palette from a match seed using FNV-1a hashing.
 * Same seed always returns the same palette. Distribution over the 20 palettes
 * is approximately uniform (verified to within ~22% over 10K random seeds).
 */
export function getPaletteForSeed(seed: Seed): NeonPalette {
  let h = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h | 0) % NEON_PALETTES.length;
  // Non-null assertion: idx is always a valid index by construction.
  return NEON_PALETTES[idx]!;
}
