/**
 * Seeded PRNG using splitmix32.
 * Deterministic: same seed always produces identical sequence.
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

/** Hash a string seed into a uint32 starting state. */
function hashSeedToUint32(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Generate a float in [min, max] from the next PRNG value. */
export function randomInRange(next: () => number, min: number, max: number): number {
  return min + next() * (max - min);
}

/** Pick a random element from an array. */
export function randomPick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)]!;
}
