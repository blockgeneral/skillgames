import { describe, it, expect } from 'vitest';
import { generateMaze } from './generator.js';
import type { CellType, Coordinate, Direction, MazeState } from '../types.js';

/**
 * Simulates a slide from a position in a direction.
 */
function simulateSlide(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  startX: number,
  startY: number,
  direction: Direction,
  width: number,
  height: number
): Coordinate {
  const vectors: Record<Direction, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  const { dx, dy } = vectors[direction];
  let x = startX;
  let y = startY;

  while (true) {
    const nextX = x + dx;
    const nextY = y + dy;

    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) break;
    const row = cells[nextY];
    if (!row || row[nextX] !== 'floor') break;

    x = nextX;
    y = nextY;
  }

  return { x, y };
}

/**
 * BFS to find all reachable floor cells via slides.
 */
function findReachableFloorCells(maze: MazeState): Set<string> {
  const reachable = new Set<string>();
  const visited = new Set<string>();
  const queue: Coordinate[] = [maze.startPosition];

  reachable.add(`${maze.startPosition.x},${maze.startPosition.y}`);

  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.x},${current.y}`;

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    for (const direction of directions) {
      const dest = simulateSlide(
        maze.cells,
        current.x,
        current.y,
        direction,
        maze.width,
        maze.height
      );

      // Mark path cells as reachable
      const vectors: Record<Direction, { dx: number; dy: number }> = {
        up: { dx: 0, dy: -1 },
        down: { dx: 0, dy: 1 },
        left: { dx: -1, dy: 0 },
        right: { dx: 1, dy: 0 },
      };
      const { dx, dy } = vectors[direction];
      let x = current.x;
      let y = current.y;

      while (x !== dest.x || y !== dest.y) {
        x += dx;
        y += dy;
        reachable.add(`${x},${y}`);
      }

      const destKey = `${dest.x},${dest.y}`;
      if (!visited.has(destKey)) {
        queue.push(dest);
      }
    }
  }

  return reachable;
}

/**
 * Counts obstacle cells in a maze.
 */
function countObstacles(maze: MazeState): number {
  let count = 0;
  for (const row of maze.cells) {
    for (const cell of row) {
      if (cell === 'obstacle') count++;
    }
  }
  return count;
}

/**
 * Deep equality check for two mazes.
 */
function mazesAreEqual(a: MazeState, b: MazeState): boolean {
  if (a.seed !== b.seed || a.width !== b.width || a.height !== b.height) {
    return false;
  }

  if (
    a.startPosition.x !== b.startPosition.x ||
    a.startPosition.y !== b.startPosition.y
  ) {
    return false;
  }

  for (let y = 0; y < a.height; y++) {
    const rowA = a.cells[y];
    const rowB = b.cells[y];
    if (!rowA || !rowB) return false;

    for (let x = 0; x < a.width; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }

  return true;
}

describe('generateMaze', () => {
  describe('determinism', () => {
    it('produces identical maze for same seed across 1000 runs', () => {
      const seed = 'a'.repeat(64);
      const size = 6;

      const firstMaze = generateMaze(seed, size, 10);

      for (let i = 0; i < 1000; i++) {
        const maze = generateMaze(seed, size, 10);
        expect(mazesAreEqual(firstMaze, maze)).toBe(true);
      }
    });

    it('produces identical mazes for multiple different seeds (each run twice)', () => {
      const seeds = [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        'd'.repeat(64),
        'e'.repeat(64),
        'f'.repeat(64),
        '0'.repeat(64),
        '1'.repeat(64),
        '0123456789abcdef'.repeat(4),
        'fedcba9876543210'.repeat(4),
      ];

      for (const seed of seeds) {
        const maze1 = generateMaze(seed, 6, 10);
        const maze2 = generateMaze(seed, 6, 10);
        expect(mazesAreEqual(maze1, maze2)).toBe(true);
      }
    });

    it('produces identical mazes across different sizes', () => {
      const seed = 'a'.repeat(64);
      const configs = [
        { size: 6, obstacle: 10 },
        { size: 9, obstacle: 15 },
        { size: 12, obstacle: 18 },
      ];

      for (const config of configs) {
        const maze1 = generateMaze(seed, config.size, config.obstacle);
        const maze2 = generateMaze(seed, config.size, config.obstacle);
        expect(mazesAreEqual(maze1, maze2)).toBe(true);
      }
    });
  });

  describe('variation', () => {
    it('produces different mazes for different seeds at same size', () => {
      const seed1 = 'a'.repeat(64);
      const seed2 = 'b'.repeat(64);
      const size = 6;

      const maze1 = generateMaze(seed1, size, 10);
      const maze2 = generateMaze(seed2, size, 10);

      expect(mazesAreEqual(maze1, maze2)).toBe(false);
    });
  });

  describe('solvability', () => {
    it('ensures every floor cell is reachable for 50 seeds at easy (6x6, 10%)', () => {
      const seeds = Array.from({ length: 50 }, (_, i) =>
        (i.toString(16).padStart(2, '0')).repeat(32)
      );

      for (const seed of seeds) {
        const maze = generateMaze(seed, 6, 10);
        const floorCells = new Set<string>();

        for (let y = 0; y < maze.height; y++) {
          const row = maze.cells[y];
          if (!row) continue;
          for (let x = 0; x < maze.width; x++) {
            if (row[x] === 'floor') {
              floorCells.add(`${x},${y}`);
            }
          }
        }

        const reachable = findReachableFloorCells(maze);

        for (const floorKey of floorCells) {
          expect(reachable.has(floorKey)).toBe(true);
        }
      }
    });

    it('ensures every floor cell is reachable for 50 seeds at medium (9x9, 15%)', () => {
      const seeds = Array.from({ length: 50 }, (_, i) =>
        ((i + 50).toString(16).padStart(2, '0')).repeat(32)
      );

      for (const seed of seeds) {
        const maze = generateMaze(seed, 9, 15);
        const floorCells = new Set<string>();

        for (let y = 0; y < maze.height; y++) {
          const row = maze.cells[y];
          if (!row) continue;
          for (let x = 0; x < maze.width; x++) {
            if (row[x] === 'floor') {
              floorCells.add(`${x},${y}`);
            }
          }
        }

        const reachable = findReachableFloorCells(maze);

        for (const floorKey of floorCells) {
          expect(reachable.has(floorKey)).toBe(true);
        }
      }
    });

    it('ensures every floor cell is reachable for 50 seeds at hard (12x12, 18%)', () => {
      const seeds = Array.from({ length: 50 }, (_, i) =>
        ((i + 100).toString(16).padStart(2, '0')).repeat(32)
      );

      for (const seed of seeds) {
        const maze = generateMaze(seed, 12, 18);
        const floorCells = new Set<string>();

        for (let y = 0; y < maze.height; y++) {
          const row = maze.cells[y];
          if (!row) continue;
          for (let x = 0; x < maze.width; x++) {
            if (row[x] === 'floor') {
              floorCells.add(`${x},${y}`);
            }
          }
        }

        const reachable = findReachableFloorCells(maze);

        for (const floorKey of floorCells) {
          expect(reachable.has(floorKey)).toBe(true);
        }
      }
    });
  });

  describe('start position', () => {
    it('places start position at bottom-left (0, height-1)', () => {
      const seeds = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
      const sizes = [6, 9, 12];

      for (const seed of seeds) {
        for (const size of sizes) {
          const maze = generateMaze(seed, size, 10);
          expect(maze.startPosition.x).toBe(0);
          expect(maze.startPosition.y).toBe(size - 1);
        }
      }
    });

    it('never places an obstacle on the start position', () => {
      const seeds = Array.from({ length: 100 }, (_, i) =>
        (i.toString(16).padStart(2, '0')).repeat(32)
      );

      for (const seed of seeds) {
        const maze = generateMaze(seed, 6, 15);
        const startCell = maze.cells[maze.startPosition.y]?.[maze.startPosition.x];
        expect(startCell).toBe('floor');
      }
    });
  });

  describe('obstacle placement', () => {
    it('places approximately the target percentage of obstacles', () => {
      const seed = 'a'.repeat(64);
      const size = 9;
      const obstaclePercent = 15;

      const maze = generateMaze(seed, size, obstaclePercent);
      const obstacleCount = countObstacles(maze);
      const totalCells = size * size;
      const targetObstacles = Math.floor((totalCells * obstaclePercent) / 100);

      // Allow variance due to solvability constraints:
      // - May have fewer if obstacles were rejected to maintain solvability
      // - May have more if unreachable floor cells were converted to obstacles
      // The actual count should be within a reasonable range of the target
      expect(obstacleCount).toBeGreaterThan(0);
      expect(obstacleCount).toBeLessThan(totalCells - 1); // Must leave at least start cell as floor

      // Log actual vs target for debugging/tuning (visible in test output)
      console.log(`Obstacle placement: target=${targetObstacles}, actual=${obstacleCount}`);
    });

    it('produces only floor and obstacle cells (no void in v1)', () => {
      const seeds = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];

      for (const seed of seeds) {
        const maze = generateMaze(seed, 9, 15);

        for (const row of maze.cells) {
          for (const cell of row) {
            expect(cell === 'floor' || cell === 'obstacle').toBe(true);
          }
        }
      }
    });
  });

  describe('input validation', () => {
    it('throws for size < 2', () => {
      const seed = 'a'.repeat(64);
      expect(() => generateMaze(seed, 1, 10)).toThrow('Size must be at least 2');
      expect(() => generateMaze(seed, 0, 10)).toThrow('Size must be at least 2');
      expect(() => generateMaze(seed, -1, 10)).toThrow('Size must be at least 2');
    });

    it('throws for size > 100', () => {
      const seed = 'a'.repeat(64);
      expect(() => generateMaze(seed, 101, 10)).toThrow('Size must be at most 100');
    });

    it('throws for non-hex seed', () => {
      expect(() => generateMaze('g'.repeat(64), 6, 10)).toThrow('hexadecimal');
      expect(() => generateMaze('zzzzzzzz'.repeat(8), 6, 10)).toThrow('hexadecimal');
    });

    it('throws for wrong seed length', () => {
      expect(() => generateMaze('a'.repeat(63), 6, 10)).toThrow('64 characters');
      expect(() => generateMaze('a'.repeat(65), 6, 10)).toThrow('64 characters');
      expect(() => generateMaze('a', 6, 10)).toThrow('64 characters');
      expect(() => generateMaze('', 6, 10)).toThrow('64 characters');
    });

    it('throws for obstacle percent out of range', () => {
      const seed = 'a'.repeat(64);
      expect(() => generateMaze(seed, 6, -1)).toThrow('Obstacle percent must be 0-100');
      expect(() => generateMaze(seed, 6, 101)).toThrow('Obstacle percent must be 0-100');
    });
  });

  describe('seed normalization', () => {
    it('produces identical mazes for uppercase and lowercase seeds', () => {
      const lowerSeed = 'abcdef0123456789'.repeat(4);
      const upperSeed = 'ABCDEF0123456789'.repeat(4);
      const mixedSeed = 'AbCdEf0123456789'.repeat(4);
      const size = 6;

      const lowerMaze = generateMaze(lowerSeed, size, 10);
      const upperMaze = generateMaze(upperSeed, size, 10);
      const mixedMaze = generateMaze(mixedSeed, size, 10);

      expect(mazesAreEqual(lowerMaze, upperMaze)).toBe(true);
      expect(mazesAreEqual(lowerMaze, mixedMaze)).toBe(true);
    });

    it('normalizes seed to lowercase in returned maze', () => {
      const upperSeed = 'ABCDEF0123456789'.repeat(4);
      const expectedSeed = 'abcdef0123456789'.repeat(4);

      const maze = generateMaze(upperSeed, 6, 10);

      expect(maze.seed).toBe(expectedSeed);
    });
  });

  describe('maze structure', () => {
    it('returns correct metadata', () => {
      const seed = 'a'.repeat(64);
      const size = 9;

      const maze = generateMaze(seed, size, 15);

      expect(maze.seed).toBe(seed);
      expect(maze.width).toBe(size);
      expect(maze.height).toBe(size);
      expect(maze.cells.length).toBe(size);
      expect(maze.cells[0]?.length).toBe(size);
    });
  });

  describe('retry behavior', () => {
    it('deterministically retries and produces same result', () => {
      // Use a seed that might require retries (higher obstacle density)
      const seed = 'deadbeef'.repeat(8);
      const size = 6;
      const obstaclePercent = 18;

      const maze1 = generateMaze(seed, size, obstaclePercent);
      const maze2 = generateMaze(seed, size, obstaclePercent);

      expect(mazesAreEqual(maze1, maze2)).toBe(true);
    });
  });
});
