import { describe, it, expect } from 'vitest';
import { generateMaze } from './generator.js';
import { simulateSlide } from './painter.js';
import type { Difficulty, MazeState, Coordinate, CellType } from '../types.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * BFS over slide-reachable positions. From each reachable stopping position,
 * try all 4 slides; every cell on every slide path is marked reachable.
 */
function reachableFloorsViaSlides(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  width: number,
  height: number,
  start: Coordinate,
): Set<string> {
  const reached = new Set<string>([`${start.x},${start.y}`]);
  const queue: Coordinate[] = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const slide = simulateSlide(cells, node.x, node.y, dir, width, height);
      for (const cell of slide.path) {
        const key = `${cell.x},${cell.y}`;
        if (!reached.has(key)) {
          reached.add(key);
          queue.push(cell);
        }
      }
    }
  }
  return reached;
}

function countFloors(maze: MazeState): number {
  let n = 0;
  for (const row of maze.cells) for (const c of row) if (c === 'floor') n++;
  return n;
}

function tryGenerate(seed: string, difficulty: Difficulty): MazeState | null {
  try {
    return generateMaze(seed, difficulty);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('GeneratorConstraintsUnmet') || msg.startsWith('GeneratorBudgetExceeded')) {
      return null;
    }
    throw e;
  }
}

describe('generateMaze — determinism', () => {
  it('produces byte-identical output across 1000 runs for the same seed and difficulty', () => {
    const seed = 'a'.repeat(64);
    const first = JSON.stringify(generateMaze(seed, 'medium'));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(generateMaze(seed, 'medium'))).toBe(first);
    }
  });

  it('is deterministic for every difficulty (same seed → same width, height, grid)', () => {
    const seed = 'b'.repeat(64);
    for (const d of DIFFICULTIES) {
      const a = generateMaze(seed, d);
      const b = generateMaze(seed, d);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.width).toBe(b.width);
      expect(a.height).toBe(b.height);
    }
  });
});

describe('generateMaze — variation', () => {
  it('produces different outputs for different seeds', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => i.toString(16).padStart(64, '0'));
    const results = new Set(seeds.map((s) => JSON.stringify(generateMaze(s, 'medium'))));
    expect(results.size).toBe(10);
  });
});

describe('generateMaze — reachability under slide physics', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`every floor cell is on some slide path from a reachable position (${difficulty}, 50 seeds)`, () => {
      let successes = 0;
      for (let i = 0; i < 50; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = tryGenerate(seed, difficulty);
        if (!maze) continue;
        successes++;
        const reached = reachableFloorsViaSlides(maze.cells, maze.width, maze.height, maze.startPosition);
        for (let y = 0; y < maze.height; y++) {
          for (let x = 0; x < maze.width; x++) {
            if (maze.cells[y]![x] === 'floor') {
              expect(reached.has(`${x},${y}`)).toBe(true);
            }
          }
        }
      }
      expect(successes).toBeGreaterThanOrEqual(40);
    });
  }
});

describe('generateMaze — floor count within derived bounds', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`floor count is within [carveable*0.70, carveable*0.80] (${difficulty}, 50 seeds)`, () => {
      const counts: number[] = [];
      let successes = 0;
      for (let i = 0; i < 50; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = tryGenerate(seed, difficulty);
        if (!maze) continue;
        successes++;
        const floors = countFloors(maze);
        counts.push(floors);
        const carveable = (maze.width - 2) * (maze.height - 2) + 1;
        const floorMin = Math.floor(carveable * 0.70);
        const floorMax = Math.floor(carveable * 0.80);
        expect(floors).toBeGreaterThanOrEqual(floorMin);
        expect(floors).toBeLessThanOrEqual(floorMax);
      }
      expect(successes).toBeGreaterThanOrEqual(40);
      const sorted = [...counts].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      console.log(`[${difficulty}] floor counts: min=${Math.min(...counts)} max=${Math.max(...counts)} median=${median} success=${successes}/50`);
    });
  }
});

describe('generateMaze — minimumMoveLowerBound sanity', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`minimumMoveLowerBound >= 1 (${difficulty}, 20 seeds)`, () => {
      for (let i = 0; i < 20; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = tryGenerate(seed, difficulty);
        if (!maze) continue;
        expect(maze.minimumMoveLowerBound).toBeGreaterThanOrEqual(1);
      }
    });
  }
});

describe('generateMaze — dimension diversity', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`produces multiple distinct (width, height) combos across 50 seeds (${difficulty})`, () => {
      const dims = new Set<string>();
      const grids = new Set<string>();
      let ok = 0;
      for (let s = 0; s < 50; s++) {
        const seed = s.toString(16).padStart(64, '0');
        const maze = tryGenerate(seed, difficulty);
        if (!maze) continue;
        ok++;
        dims.add(`${maze.width}x${maze.height}`);
        const hash = maze.cells.map(r => r.map(c => c === 'floor' ? '.' : '#').join('')).join('|');
        grids.add(hash);
      }
      console.log(`[${difficulty}] dimension diversity: ok=${ok}/50 dims=${[...dims].join(',')} unique_grids=${grids.size}/${ok}`);
      expect(ok).toBeGreaterThanOrEqual(40);
      expect(dims.size).toBeGreaterThanOrEqual(2);
      expect(grids.size).toBeGreaterThanOrEqual(Math.floor(ok * 0.95));
    });
  }
});

describe('generateMaze — shape diversity', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`produces diverse layouts across 100 seeds (${difficulty})`, () => {
      const grids = new Set<string>();
      const obstCounts: number[] = [];
      let ok = 0;
      for (let s = 0; s < 100; s++) {
        const seed = s.toString(16).padStart(64, '0');
        try {
          const maze = generateMaze(seed, difficulty);
          ok++;
          const hash = maze.cells.map(r => r.map(c => c === 'floor' ? '.' : '#').join('')).join('|');
          grids.add(hash);
          let obstacles = 0;
          for (const row of maze.cells) for (const c of row) if (c === 'obstacle') obstacles++;
          obstCounts.push(obstacles);
        } catch { /* accepted below */ }
      }
      const spread = Math.max(...obstCounts) - Math.min(...obstCounts);
      const minSpread = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : 12;
      console.log(`[${difficulty}] diversity: ok=${ok}/100 unique=${grids.size}/${ok} obstSpread=${spread} (min=${Math.min(...obstCounts)} max=${Math.max(...obstCounts)}) minSpread=${minSpread}`);
      expect(ok).toBeGreaterThanOrEqual(95);
      expect(grids.size).toBeGreaterThanOrEqual(Math.floor(ok * 0.95));
      expect(spread).toBeGreaterThanOrEqual(minSpread);
    });
  }
});

describe('generateMaze — solvability by construction', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`every successful generation has minimumMoveLowerBound > 0 (${difficulty}, 30 seeds)`, () => {
      let successes = 0;
      for (let i = 0; i < 30; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = tryGenerate(seed, difficulty);
        if (!maze) continue;
        successes++;
        expect(maze.minimumMoveLowerBound).toBeGreaterThan(0);
      }
      expect(successes).toBeGreaterThanOrEqual(24);
    });
  }
});

describe('generateMaze — timing (hard)', () => {
  it('p50 < 50ms, p95 < 200ms, zero budget exceptions (30 seeds)', () => {
    let exceeded = 0;
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const seed = i.toString(16).padStart(64, '0');
      const t0 = Date.now();
      try {
        generateMaze(seed, 'hard');
        times.push(Date.now() - t0);
      } catch (e) {
        if ((e as Error).message.startsWith('GeneratorBudgetExceeded')) {
          exceeded++;
        } else {
          times.push(Date.now() - t0);
        }
      }
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? 0;
    const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
    console.log(`[hard timing] p50=${p50}ms p95=${p95}ms budgetExceeded=${exceeded}/30`);
    expect(exceeded).toBe(0);
    expect(p50).toBeLessThan(50);
    expect(p95).toBeLessThan(200);
  });
});

describe('generateMaze — input validation', () => {
  it('throws on non-hex seed', () => {
    expect(() => generateMaze('not-hex', 'easy')).toThrow();
  });
  it('throws on wrong-length seed', () => {
    expect(() => generateMaze('a'.repeat(63), 'easy')).toThrow();
  });
  it('throws on invalid difficulty', () => {
    expect(() => generateMaze('a'.repeat(64), 'invalid' as Difficulty)).toThrow();
  });
});

describe('generateMaze — ASCII visual sample (for human inspection)', () => {
  it('prints a sample maze for each difficulty', () => {
    const seed = 'c'.repeat(64);
    for (const d of DIFFICULTIES) {
      const maze = generateMaze(seed, d);
      const floors = countFloors(maze);
      const lines: string[] = [];
      lines.push(`\n--- ${d} (${maze.width}x${maze.height}, ${floors} floors, ${maze.minimumMoveLowerBound} recorded moves) ---`);
      for (let y = 0; y < maze.height; y++) {
        const row: string[] = [];
        for (let x = 0; x < maze.width; x++) {
          if (x === maze.startPosition.x && y === maze.startPosition.y) row.push('S');
          else if (maze.cells[y]![x] === 'floor') row.push('.');
          else row.push('#');
        }
        lines.push(row.join(' '));
      }
      console.log(lines.join('\n'));
      expect(true).toBe(true);
    }
  });
});
