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

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

function isHexSeed(seed: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(seed);
}

type Grid = CellType[][];

function makeObstacleGrid(width: number, height: number): Grid {
  const g: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x++) row.push('obstacle');
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

function deriveSubPrng(seed: Seed, attemptIndex: number): () => number {
  return createPrng(`${seed}:${attemptIndex}`);
}

function pickDimensions(seed: Seed, cfg: { widthMin: number; widthMax: number; heightMin: number; heightMax: number }): { width: number; height: number } {
  const prng = createPrng(`${seed}:dims`);
  const width  = cfg.widthMin  + Math.floor(prng() * (cfg.widthMax  - cfg.widthMin  + 1));
  const height = cfg.heightMin + Math.floor(prng() * (cfg.heightMax - cfg.heightMin + 1));
  return { width, height };
}

function generateAttempt(
  seed: Seed,
  width: number,
  height: number,
  moveBudget: number,
  stopProb: number,
  floorMax: number,
  attemptIndex: number,
): { grid: Grid; start: Coordinate; recorded: Dir[] } {
  const primary = deriveSubPrng(seed, attemptIndex);
  const grid = makeObstacleGrid(width, height);
  const locked = new Set<string>();
  const start: Coordinate = { x: 1, y: height - 2 };
  grid[start.y]![start.x] = 'floor';

  // Lock the outer perimeter as permanent obstacles.
  for (let x = 0; x < width; x++) {
    locked.add(`${x},0`);
    locked.add(`${x},${height - 1}`);
  }
  for (let y = 0; y < height; y++) {
    locked.add(`0,${y}`);
    locked.add(`${width - 1},${y}`);
  }

  let bx = start.x, by = start.y;
  let lastDir: Dir | null = null;
  const recorded: Dir[] = [];

  for (let mv = 0; mv < moveBudget; mv++) {
    if (countFloors(grid) >= floorMax) break;

    const scored: { dir: Dir; nc: number }[] = [];
    for (const d of DIRECTIONS) {
      const { dx, dy } = dirVec(d);
      const localRand = createPrng(`${seed}:${attemptIndex}:${mv}:${d}`);
      let x = bx, y = by;
      let nc = 0;
      let moved = false;
      while (true) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny, width, height)) break;
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

    const commitRand = createPrng(`${seed}:${attemptIndex}:${mv}:${chosen}`);
    const { dx, dy } = dirVec(chosen);
    let x = bx, y = by;
    while (true) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, width, height)) break;
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

function replayPainted(grid: Grid, width: number, height: number, start: Coordinate, moves: Dir[]): Set<string> {
  const painted = new Set<string>([`${start.x},${start.y}`]);
  let cx = start.x, cy = start.y;
  for (const d of moves) {
    const { dx, dy } = dirVec(d);
    let x = cx, y = cy;
    painted.add(`${x},${y}`);
    while (true) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny, width, height)) break;
      if (grid[ny]![nx] !== 'floor') break;
      x = nx; y = ny;
      painted.add(`${x},${y}`);
    }
    cx = x; cy = y;
  }
  return painted;
}

function allFloorsPainted(grid: Grid, width: number, height: number, painted: Set<string>): boolean {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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

  const { width, height } = pickDimensions(seed, config);
  const carveable = (width - 2) * (height - 2) + 1;
  const floorTargetMin = Math.floor(carveable * 0.70);
  const floorTargetMax = Math.floor(carveable * 0.80);
  const solutionMoveBudget = Math.floor(floorTargetMax * 1.2);
  const stopProb = difficulty === 'easy' ? 0.20 : difficulty === 'medium' ? 0.17 : 0.13;

  const startTime = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startTime > BUDGET_MS) {
      throw new Error(`GeneratorBudgetExceeded: exceeded ${BUDGET_MS}ms for seed ${seed.slice(0, 12)}... at ${difficulty}`);
    }
    const r = generateAttempt(seed, width, height, solutionMoveBudget, stopProb, floorTargetMax, attempt);
    const floors = countFloors(r.grid);
    if (floors < floorTargetMin || floors > floorTargetMax) continue;
    const painted = replayPainted(r.grid, width, height, r.start, r.recorded);
    if (!allFloorsPainted(r.grid, width, height, painted)) continue;
    return {
      seed,
      width,
      height,
      cells: freezeGrid(r.grid),
      startPosition: Object.freeze({ ...r.start }),
      minimumMoveLowerBound: r.recorded.length,
    };
  }
  throw new Error(`GeneratorConstraintsUnmet: could not produce valid ${difficulty} level for seed ${seed.slice(0, 12)}... after ${MAX_ATTEMPTS} attempts`);
}
