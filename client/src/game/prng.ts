/**
 * Re-export of the PRNG for client-side opponent simulation.
 * Uses the same algorithm as shared to keep it deterministic.
 */

export function createPrng(seed: string): () => number {
  let state = hashSeedToUint32(seed);
  return (): number => {
    state |= 0;
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  };
}

function hashSeedToUint32(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function randomInRange(next: () => number, min: number, max: number): number {
  return min + next() * (max - min);
}
