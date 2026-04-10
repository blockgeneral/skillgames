/**
 * PRNG type - a function that returns a float in [0, 1) when called.
 */
export type PRNG = () => number;

/**
 * Computes the FNV-1a hash of a string, returning a 32-bit unsigned integer.
 *
 * FNV-1a is a non-cryptographic hash function known for its simplicity and
 * good distribution properties. It processes the input byte-by-byte,
 * XORing each byte with the hash and then multiplying by a prime.
 *
 * @param str - The string to hash
 * @returns A 32-bit unsigned integer hash
 */
function fnv1aHash(str: string): number {
  // FNV-1a parameters for 32-bit hash
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by prime and keep it 32-bit unsigned
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Creates a seeded pseudo-random number generator using the mulberry32 algorithm.
 *
 * Mulberry32 is a simple but high-quality 32-bit PRNG. It has a period of 2^32
 * and passes BigCrush statistical tests. The algorithm uses a single 32-bit
 * state value that is updated on each call.
 *
 * The seed string is hashed using FNV-1a to produce the initial 32-bit state.
 *
 * @param seed - A hex string to initialize the PRNG state
 * @returns A function that generates floats in [0, 1) when called
 */
export function createPrng(seed: string): PRNG {
  let state = fnv1aHash(seed);

  return (): number => {
    // Mulberry32 algorithm
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    // Convert to float in [0, 1)
    return t / 0x100000000;
  };
}

/**
 * Generates a random integer in the range [min, max).
 *
 * Uses the provided PRNG to generate a value, then scales and floors it
 * to produce an integer in the specified range.
 *
 * @param prng - The PRNG function to use
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (exclusive)
 * @returns An integer in [min, max)
 */
export function randomInt(prng: PRNG, min: number, max: number): number {
  return Math.floor(prng() * (max - min)) + min;
}

/**
 * Returns a new array with elements shuffled using the Fisher-Yates algorithm.
 *
 * Fisher-Yates (also known as Knuth shuffle) produces a uniformly random
 * permutation by iterating from the last element to the first, swapping
 * each element with a randomly selected element from the remaining unshuffled
 * portion.
 *
 * This function is pure: it does not modify the input array.
 *
 * @param prng - The PRNG function to use for randomization
 * @param array - The array to shuffle
 * @returns A new array with elements in random order
 */
export function shuffle<T>(prng: PRNG, array: ReadonlyArray<T>): T[] {
  const result = [...array];

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(prng, 0, i + 1);
    // Swap elements - we know these indices are valid since i and j are in bounds
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }

  return result;
}
