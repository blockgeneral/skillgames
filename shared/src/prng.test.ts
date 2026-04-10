import { describe, it, expect } from 'vitest';
import { createPrng, randomInt, shuffle } from './prng.js';

describe('createPrng', () => {
  it('produces identical sequence for same seed across two separate calls', () => {
    const seed = 'a'.repeat(64);
    const prng1 = createPrng(seed);
    const prng2 = createPrng(seed);

    const sequence1: number[] = [];
    const sequence2: number[] = [];

    for (let i = 0; i < 1000; i++) {
      sequence1.push(prng1());
      sequence2.push(prng2());
    }

    expect(sequence1).toEqual(sequence2);
  });

  it('produces different sequences for different seeds', () => {
    const seed1 = 'a'.repeat(64);
    const seed2 = 'b'.repeat(64);
    const prng1 = createPrng(seed1);
    const prng2 = createPrng(seed2);

    const sequence1: number[] = [];
    const sequence2: number[] = [];

    for (let i = 0; i < 100; i++) {
      sequence1.push(prng1());
      sequence2.push(prng2());
    }

    expect(sequence1).not.toEqual(sequence2);
  });

  it('produces values in range [0, 1)', () => {
    const seed = 'c'.repeat(64);
    const prng = createPrng(seed);

    for (let i = 0; i < 10000; i++) {
      const value = prng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('produces values only in range [min, max)', () => {
    const seed = 'd'.repeat(64);
    const prng = createPrng(seed);

    const values = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const value = randomInt(prng, 0, 10);
      values.add(value);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
      expect(Number.isInteger(value)).toBe(true);
    }

    // Should eventually hit all values in range with enough samples
    expect(values.size).toBe(10);
  });

  it('works with non-zero min', () => {
    const seed = 'e'.repeat(64);
    const prng = createPrng(seed);

    for (let i = 0; i < 1000; i++) {
      const value = randomInt(prng, 5, 15);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(15);
    }
  });
});

describe('shuffle', () => {
  it('produces identical shuffle for same seed', () => {
    const seed = 'f'.repeat(64);
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const prng1 = createPrng(seed);
    const prng2 = createPrng(seed);

    const shuffled1 = shuffle(prng1, array);
    const shuffled2 = shuffle(prng2, array);

    expect(shuffled1).toEqual(shuffled2);
  });

  it('preserves all elements', () => {
    const seed = '0'.repeat(64);
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const prng = createPrng(seed);

    const shuffled = shuffle(prng, array);

    expect(shuffled.sort((a, b) => a - b)).toEqual(array);
    expect(shuffled.length).toBe(array.length);
  });

  it('does not modify the original array', () => {
    const seed = '1'.repeat(64);
    const array = [1, 2, 3, 4, 5];
    const originalCopy = [...array];
    const prng = createPrng(seed);

    shuffle(prng, array);

    expect(array).toEqual(originalCopy);
  });

  it('actually shuffles the array (different order than original)', () => {
    const seed = '2'.repeat(64);
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const prng = createPrng(seed);

    const shuffled = shuffle(prng, array);

    // With high probability, shuffled order differs from original
    expect(shuffled).not.toEqual(array);
  });

  it('handles empty arrays', () => {
    const seed = '3'.repeat(64);
    const prng = createPrng(seed);
    const result = shuffle(prng, []);
    expect(result).toEqual([]);
  });

  it('handles single element arrays', () => {
    const seed = '4'.repeat(64);
    const prng = createPrng(seed);
    const result = shuffle(prng, [42]);
    expect(result).toEqual([42]);
  });
});
