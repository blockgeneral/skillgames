import type { CellType, Coordinate, Difficulty, MazeState, Seed } from '../types.js';
import { DIFFICULTY_CONFIGS } from '../types.js';
import { createPrng } from '../prng.js';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Dir = (typeof DIRECTIONS)[number];

function dirVec(d: Dir): { dx: number; dy: number } {
  switch (d) {
    case 'up':    return { dx: 0,  dy: -1 };
    case 'down':  return { dx: 0,  dy: 1 };
    case 'left':  return { dx: -1, dy: 0 };
    case 'right': return { dx: 1,  dy: 0 };
  }
}

function isOpposite(a: Dir, b: Dir): boolean {
  return (a === 'up' && b === 'down') || (a === 'down' && b === 'up') ||
         (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
}

function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function isHexSeed(seed: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(seed);
}

type Grid = CellType[][];

function makeObstacleGrid(size: number): Grid {
  const g: Grid = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) row.push('obstacle');
    g.push(row);
  }
  return g;
}

function countFloors(g: Grid): number {
  let n = 0;
  for (const r of g) for (const c of r) if (c === 'floor') n++;
  return n;
}

function freezeGrid(g: Grid): ReadonlyArray<ReadonlyArray<CellType>> {
  const rows: ReadonlyArray<CellType>[] = [];
  for (const r of g) rows.push(Object.freeze([...r]));
  return Object.freeze(rows);
}

/**
 * Derive a deterministic sub-PRNG for a retry attempt.
 * Same (seed, attemptIndex) always yields the same PRNG.
 */
function deriveSubPrng(seed: Seed, attemptIndex: number): () => number {
  return createPrng(`${seed}:${attemptIndex}`);
}

/**
 * Single attempt at generating a level. Returns the grid, start position,
 * and recorded solution moves. Does not validate constraints — that's done
 * by the caller.
 *
 * Algorithm: place a virtual ball at bottom-left. For up to solutionMoveBudget
 * moves, choose a direction weighted by (new cells it would carve × 8 + 2),
 * with opposite-of-last-direction heavily downweighted. Slide in that
 * direction, carving obstacles into floor, until we hit a locked stopper, a
 * randomly-decided new stopper (probability stopProb per obstacle encountered),
 * or the grid edge. Any cell that stops a slide becomes LOCKED — future moves
 * cannot carve it, even if they approach from a different angle. This lock
 * preserves slide physics across the entire move sequence, making the recorded
 * sequence a valid solution on the final grid.
 */
function generateAttempt(
  seed: Seed,
  size: number,
  moveBudget: number,
  stopProb: number,
  floorMax: number,
  attemptIndex: number,
): { grid: Grid; start: Coordinate; recorded: Dir[] } {
  const primary = deriveSubPrng(seed, attemptIndex);
  const grid = makeObstacleGrid(size);
  const locked = new Set<string>();
  const start: Coordinate = { x: 0, y: size - 1 };
  grid[start.y]![start.x] = 'floor';
  let bx = start.x, by = start.y;
  let lastDir: Dir | null = null;
  const recorded: Dir[] = [];

  for (let mv = 0; mv < moveBudget; mv++) {
    if (countFloors(grid) >= floorMax) break;

    // Score candidate directions by the number of new cells each would carve.
    // Each direction uses its own deterministic sub-PRNG for the stop-coin
    // flips so that the score-simulation and the commit-simulation match.
    const scored: { dir: Dir; nc: number }[] = [];
    for (const d of DIRECTIONS) {
      const { dx, dy } = dirVec(d);
      const localRand = createPrng(`${seed}:${attemptIndex}:${mv}:${d}`);
      let x = bx, y = by;
      let nc = 0;
      let moved = false;
      while (true) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny, size)) break;
        if (grid[ny]![nx] === 'floor') { x = nx; y = ny; moved = true; continue; }
        const k = `${nx},${ny}`;
        if (locked.has(k)) break;
        if (localRand() < stopProb) break;
        x = nx; y = ny; nc++; moved = true;
      }
      if (moved) scored.push({ dir: d, nc });
    }
    if (scored.length === 0) break;

    const weights = scored.map(s => {
      let w = s.nc * 8 + 2;
      if (lastDir && isOpposite(s.dir, lastDir)) w = Math.max(1, Math.floor(w * 0.1));
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = primary() * total;
    let idx = 0;
    for (let i = 0; i < scored.length; i++) {
      pick -= weights[i]!;
      if (pick <= 0) { idx = i; break; }
    }
    const chosen = scored[idx]!.dir;

    // Commit: carve using a PRNG seeded identically to the scoring pass for
    // this direction, so the stop decisions match.
    const commitRand = createPrng(`${seed}:${attemptIndex}:${mv}:${chosen}`);
    const { dx, dy } = dirVec(chosen);
    let x = bx, y = by;
    while (true) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, size)) break;
      if (grid[ny]![nx] === 'floor') { x = nx; y = ny; continue; }
      const k = `${nx},${ny}`;
      if (locked.has(k)) break;
      if (commitRand() < stopProb) { locked.add(k); break; }
      grid[ny]![nx] = 'floor';
      x = nx; y = ny;
    }
    if (x === bx && y === by) continue;
    bx = x; by = y;
    lastDir = chosen;
    recorded.push(chosen);
  }
  return { grid, start, recorded };
}

/**
 * Replay the recorded move sequence on the final grid. Returns the set of
 * painted cells. Used to verify that the recorded solution actually paints
 * every floor on the final grid — this is the solvability gate.
 */
function replayPainted(grid: Grid, size: number, start: Coordinate, moves: Dir[]): Set<string> {
  const painted = new Set<string>([`${start.x},${start.y}`]);
  let cx = start.x, cy = start.y;
  for (const d of moves) {
    const { dx, dy } = dirVec(d);
    let x = cx, y = cy;
    painted.add(`${x},${y}`);
    while (true) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, size)) break;
      if (grid[ny]![nx] !== 'floor') break;
      x = nx; y = ny;
      painted.add(`${x},${y}`);
    }
    cx = x; cy = y;
  }
  return painted;
}

function allFloorsPainted(grid: Grid, size: number, painted: Set<string>): boolean {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y]![x] === 'floor' && !painted.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

const MAX_ATTEMPTS = 25;
const BUDGET_MS = 2000;

export function generateMaze(seed: Seed, difficulty: Difficulty): MazeState {
  if (typeof seed !== 'string' || !isHexSeed(seed)) {
    throw new Error(`Invalid seed: must be 64 hex characters`);
  }
  const config = DIFFICULTY_CONFIGS[difficulty];
  if (!config) throw new Error(`Invalid difficulty: ${String(difficulty)}`);

  const { size, solutionMoveBudget, stopProb, floorTargetMin, floorTargetMax } = config;
  const startTime = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startTime > BUDGET_MS) {
      throw new Error(`GeneratorBudgetExceeded: exceeded ${BUDGET_MS}ms for seed ${seed.slice(0, 12)}... at ${difficulty}`);
    }
    const r = generateAttempt(seed, size, solutionMoveBudget, stopProb, floorTargetMax, attempt);
    const floors = countFloors(r.grid);
    if (floors < floorTargetMin || floors > floorTargetMax) continue;
    const painted = replayPainted(r.grid, size, r.start, r.recorded);
    if (!allFloorsPainted(r.grid, size, painted)) continue;
    return {
      seed,
      width: size,
      height: size,
      cells: freezeGrid(r.grid),
      startPosition: Object.freeze({ ...r.start }),
      minimumMoveLowerBound: r.recorded.length,
    };
  }
  throw new Error(`GeneratorConstraintsUnmet: could not produce valid ${difficulty} level for seed ${seed.slice(0, 12)}... after ${MAX_ATTEMPTS} attempts`);
}
