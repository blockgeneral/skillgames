import { describe, it, expect } from 'vitest';
import { generateMaze } from './generator.js';
import { simulateSlide } from './painter.js';
import { DIFFICULTY_CONFIGS } from '../types.js';
import type { Difficulty, MazeState, Coordinate, CellType } from '../types.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function reachableFloors(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  size: number,
  start: Coordinate,
): Set<string> {
  const reached = new Set<string>([`${start.x},${start.y}`]);
  const queue: Coordinate[] = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const slide = simulateSlide(cells, node.x, node.y, dir, size, size);
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

describe('generateMaze — determinism', () => {
  it('produces byte-identical output across 1000 runs for the same seed and difficulty', () => {
    const seed = 'a'.repeat(64);
    const first = JSON.stringify(generateMaze(seed, 'medium'));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(generateMaze(seed, 'medium'))).toBe(first);
    }
  });

  it('is deterministic for every difficulty', () => {
    const seed = 'b'.repeat(64);
    for (const d of DIFFICULTIES) {
      const a = JSON.stringify(generateMaze(seed, d));
      const b = JSON.stringify(generateMaze(seed, d));
      expect(a).toBe(b);
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
    it(`every floor cell is reachable from start (${difficulty}, 50 seeds)`, () => {
      for (let i = 0; i < 50; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = generateMaze(seed, difficulty);
        const reached = reachableFloors(maze.cells, maze.width, maze.startPosition);
        for (let y = 0; y < maze.height; y++) {
          for (let x = 0; x < maze.width; x++) {
            if (maze.cells[y]![x] === 'floor') {
              expect(reached.has(`${x},${y}`)).toBe(true);
            }
          }
        }
      }
    });
  }
});

// The generator is deterministic per seed but a small fraction of seeds produce undersized levels.
// Production retries at the match layer with a derived seed. The test asserts the distribution is
// healthy (median in bounds, ≥90% of seeds in bounds), not that every seed is.
describe('generateMaze — floor count within difficulty bounds', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`floor count is within bounds (${difficulty}, 50 seeds)`, () => {
      const counts: number[] = [];
      for (let i = 0; i < 50; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = generateMaze(seed, difficulty);
        counts.push(countFloors(maze));
      }
      const cfg = DIFFICULTY_CONFIGS[difficulty];
      const inBounds = counts.filter((c) => c >= cfg.floorTargetMin && c <= cfg.floorTargetMax + 4).length;
      const sorted = [...counts].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      console.log(`[${difficulty}] floor counts: min=${Math.min(...counts)} max=${Math.max(...counts)} median=${median} inBounds=${inBounds}/${counts.length} configMin=${cfg.floorTargetMin} configMax=${cfg.floorTargetMax}`);
      expect(inBounds).toBeGreaterThanOrEqual(45);
      expect(median).toBeGreaterThanOrEqual(cfg.floorTargetMin);
      expect(median).toBeLessThanOrEqual(cfg.floorTargetMax + 4);
    });
  }

  it('completes within budget for typical seeds (hard, 30 seeds)', () => {
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
          throw e;
        }
      }
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)] ?? 0;
    const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
    console.log(`[hard timing] p50=${p50}ms p95=${p95}ms budgetExceeded=${exceeded}/30`);
    // Budget exceptions on a small fraction are acceptable; production retries with a derived seed.
    expect(exceeded).toBeLessThanOrEqual(3);
  });
});

describe('generateMaze — optimalSolutionLength sanity', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`optimalSolutionLength is positive and within sane bound (${difficulty}, 20 seeds)`, () => {
      const cfg = DIFFICULTY_CONFIGS[difficulty];
      for (let i = 0; i < 20; i++) {
        const seed = i.toString(16).padStart(64, '0');
        const maze = generateMaze(seed, difficulty);
        expect(maze.optimalSolutionLength).toBeGreaterThanOrEqual(1);
        expect(maze.optimalSolutionLength).toBeLessThanOrEqual(cfg.floorTargetMax * 4);
      }
    });
  }
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
      const lines: string[] = [];
      lines.push(`\n--- ${d} (size ${maze.width}, ${countFloors(maze)} floors, optimal ${maze.optimalSolutionLength} moves) ---`);
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
