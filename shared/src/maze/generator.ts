import type { CellType, Coordinate, Difficulty, MazeState, Seed } from '../types.js';
import { DIFFICULTY_CONFIGS } from '../types.js';
import { createPrng, randomInt } from '../prng.js';
import { simulateSlide } from './painter.js';

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

function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function isHexSeed(seed: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(seed);
}

/**
 * Mutable working grid wrapper. Generator builds into a 2D array of CellType
 * then freezes at the end into the immutable MazeState shape.
 */
type Grid = CellType[][];

function makeGrid(size: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push('obstacle');
    }
    grid.push(row);
  }
  return grid;
}

function countFloors(grid: Grid): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 'floor') n++;
    }
  }
  return n;
}

type SolveResult =
  | { solved: true; length: number }
  | { solved: false };

/**
 * BFS over (position, painted-bitmask) states. Returns the minimum number of
 * slide moves to paint every floor cell, or { solved: false } if no such
 * sequence exists. Uses BigInt for the bitmask so there is no cap on floor
 * count beyond memory.
 *
 * STATE_CAP guards against pathological inputs. If exceeded, throws — this
 * means the level is too complex to validate at the current difficulty and
 * the configs need retuning.
 */
function solvePaintingBFS(
  grid: Grid,
  size: number,
  start: Coordinate,
): SolveResult {
  const STATE_CAP = 500_000;

  const floorIndex = new Map<string, number>();
  let idx = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y]![x] === 'floor') {
        floorIndex.set(`${x},${y}`, idx++);
      }
    }
  }
  const totalFloors = idx;
  if (totalFloors === 0) return { solved: false };

  const startKey = `${start.x},${start.y}`;
  const startBitIdx = floorIndex.get(startKey);
  if (startBitIdx === undefined) return { solved: false };

  const startMask = 1n << BigInt(startBitIdx);
  const goalMask = (1n << BigInt(totalFloors)) - 1n;

  if (startMask === goalMask) return { solved: true, length: 0 };

  type State = { x: number; y: number; mask: bigint; depth: number };
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}|${startMask.toString(16)}`);
  const queue: State[] = [{ x: start.x, y: start.y, mask: startMask, depth: 0 }];

  while (queue.length > 0) {
    if (visited.size > STATE_CAP) {
      throw new Error(
        `Painting BFS exceeded ${STATE_CAP} states. Difficulty config produces levels too complex to validate.`,
      );
    }
    const cur = queue.shift()!;
    for (const d of DIRECTIONS) {
      const slide = simulateSlide(grid, cur.x, cur.y, d, size, size);
      if (slide.path.length === 1) continue;
      let nextMask = cur.mask;
      for (const cell of slide.path) {
        const bit = 1n << BigInt(floorIndex.get(`${cell.x},${cell.y}`)!);
        nextMask |= bit;
      }
      const nx = slide.destination.x;
      const ny = slide.destination.y;
      const nextDepth = cur.depth + 1;
      if (nextMask === goalMask) {
        return { solved: true, length: nextDepth };
      }
      const key = `${nx},${ny}|${nextMask.toString(16)}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny, mask: nextMask, depth: nextDepth });
      }
    }
  }
  return { solved: false };
}

function freezeGrid(grid: Grid): ReadonlyArray<ReadonlyArray<CellType>> {
  const frozen: ReadonlyArray<CellType>[] = [];
  for (const row of grid) {
    frozen.push(Object.freeze([...row]));
  }
  return Object.freeze(frozen);
}

/**
 * Generates a deterministic Maze Paint level for the given seed and difficulty.
 *
 * Algorithm: corridor-carve growth from the bottom-left start.
 *   1. Fill grid with obstacles, set start to floor.
 *   2. Repeatedly: pick a random reachable floor cell and a random direction.
 *      Try to slide; if the slide moves, walk along it to grow the visited
 *      set. If the slide is blocked, attempt to carve a new corridor of
 *      random length 2..maxCarveLen in that direction (with probability
 *      obstacleCarveProb). Each carve is validated via painting BFS; if the
 *      resulting grid is not fully paintable, the carve is rolled back.
 *   3. Stop when floorCount >= floorTargetMin or iteration cap reached.
 *   4. Final invariant: the grid must be fully paintable (guaranteed by
 *      construction since every accepted carve was validated).
 *   5. Compute optimalSolutionLength via the same painting BFS.
 */
export function generateMaze(seed: Seed, difficulty: Difficulty): MazeState {
  if (typeof seed !== 'string' || !isHexSeed(seed)) {
    throw new Error(`Invalid seed: must be 64 hex characters, got ${typeof seed === 'string' ? `${seed.length} chars` : typeof seed}`);
  }
  const config = DIFFICULTY_CONFIGS[difficulty];
  if (!config) {
    throw new Error(`Invalid difficulty: ${String(difficulty)}`);
  }

  const { size, obstacleCarveProb, floorTargetMin, floorTargetMax } = config;
  const prng = createPrng(seed);

  const grid = makeGrid(size);
  const startPosition: Coordinate = { x: 0, y: size - 1 };
  grid[startPosition.y]![startPosition.x] = 'floor';

  // Floor list seeds the random walk. Always picked from cells reachable as
  // stopping positions, which initially is just the start.
  const floorList: Coordinate[] = [{ x: startPosition.x, y: startPosition.y }];
  const floorSet = new Set<string>([`${startPosition.x},${startPosition.y}`]);

  const maxCarveLen = Math.max(2, Math.floor(size * 0.6));
  const iterCap = size * size * 120;

  const startTime = Date.now();
  const BUDGET_MS = 2000;
  const MAX_CONSECUTIVE_REJECTIONS = 200;
  let consecutiveRejections = 0;

  let iter = 0;
  while (countFloors(grid) < floorTargetMin && iter < iterCap) {
    iter++;
    if (Date.now() - startTime > BUDGET_MS) {
      throw new Error(`GeneratorBudgetExceeded: generation exceeded ${BUDGET_MS}ms for seed ${seed.slice(0, 12)}... at difficulty ${difficulty}`);
    }
    if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
      break;
    }
    const origin = floorList[randomInt(prng, 0, floorList.length)]!;
    const d = DIRECTIONS[randomInt(prng, 0, 4)]!;
    const allowCarve = prng() < obstacleCarveProb;

    const slide = simulateSlide(grid, origin.x, origin.y, d, size, size);
    if (slide.path.length > 1) continue;
    if (!allowCarve) continue;

    // Snapshot the cells we're about to carve so we can roll back if the
    // resulting level is not fully paintable.
    const len = 2 + randomInt(prng, 0, maxCarveLen - 1);
    const { dx, dy } = dirVec(d);
    const carved: Coordinate[] = [];
    let cx = origin.x;
    let cy = origin.y;
    for (let step = 0; step < len; step++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, size)) break;
      const cell = grid[ny]![nx]!;
      if (cell === 'floor') break;
      carved.push({ x: nx, y: ny });
      cx = nx;
      cy = ny;
    }
    if (carved.length === 0) continue;

    // Tentatively commit
    for (const c of carved) grid[c.y]![c.x] = 'floor';

    // Validate: the post-carve grid must be fully paintable from start.
    // If not, roll back and try a different carve.
    let validation: SolveResult;
    try {
      validation = solvePaintingBFS(grid, size, startPosition);
    } catch {
      // BFS state cap exceeded — roll back, the level is getting too complex
      for (const c of carved) grid[c.y]![c.x] = 'obstacle';
      consecutiveRejections++;
      continue;
    }
    if (!validation.solved) {
      for (const c of carved) grid[c.y]![c.x] = 'obstacle';
      consecutiveRejections++;
      continue;
    }

    // Carve accepted. Add the new floor cells via the actual slide path
    // from origin in direction d so floorList only contains cells the ball
    // actually passes through (which is the whole carved corridor).
    const newSlide = simulateSlide(grid, origin.x, origin.y, d, size, size);
    for (const cell of newSlide.path) {
      const key = `${cell.x},${cell.y}`;
      if (!floorSet.has(key)) {
        floorSet.add(key);
        floorList.push(cell);
      }
    }
    consecutiveRejections = 0;

    if (countFloors(grid) >= floorTargetMax) break;
  }

  // Final invariant: the grid must be fully paintable. Since every accepted
  // carve was validated against this exact check, this should always hold.
  const finalSolve = solvePaintingBFS(grid, size, startPosition);
  if (!finalSolve.solved) {
    throw new Error('Generator invariant violated: final grid is not fully paintable. This is a generator bug.');
  }

  return {
    seed,
    width: size,
    height: size,
    cells: freezeGrid(grid),
    startPosition: Object.freeze({ ...startPosition }),
    optimalSolutionLength: finalSolve.length,
  };
}
