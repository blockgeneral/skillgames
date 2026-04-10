/**
 * Generates a cryptographically random 64-character hex seed.
 *
 * Uses crypto.getRandomValues for secure randomness.
 * This is the only place in the client where randomness is allowed.
 * When the server lands in Session 4, this code goes away.
 */
export function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
