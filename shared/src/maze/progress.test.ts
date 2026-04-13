import { describe, it, expect } from 'vitest';
import { calculateProgress } from './progress.js';
import { generateMaze } from './generator.js';
import { createInitialGameState } from './painter.js';
import type { CellType, MazeGameState, MazeState } from '../types.js';
import { coordinateToKey } from '../types.js';

/**
 * Creates a simple maze with all floor cells (no obstacles).
 */
function createAllFloorMaze(size: number): MazeState {
  const cells: CellType[][] = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  return {
    seed: 'a'.repeat(64),
    width: size,
    height: size,
    cells,
    startPosition: { x: 0, y: size - 1 },
    minimumMoveLowerBound: 0,
  };
}

/**
 * Creates a maze with a specific number of obstacles.
 * Obstacles are placed starting from top-left, avoiding start position.
 */
function createMazeWithObstacles(size: number, obstacleCount: number): MazeState {
  const cells: CellType[][] = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  // Place obstacles (avoiding start position at bottom-left)
  let placed = 0;
  outer: for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (placed >= obstacleCount) break outer;
      // Skip start position (0, size-1)
      if (x === 0 && y === size - 1) continue;
      cells[y]![x] = 'obstacle';
      placed++;
    }
  }

  return {
    seed: 'b'.repeat(64),
    width: size,
    height: size,
    cells,
    startPosition: { x: 0, y: size - 1 },
    minimumMoveLowerBound: 0,
  };
}

/**
 * Creates a game state with a specific number of floor cells painted.
 */
function createStateWithPaintedFloorCells(
  maze: MazeState,
  paintCount: number
): MazeGameState {
  const paintedCells = new Set<string>();

  // Paint floor cells row by row until we reach the count
  let painted = 0;
  outer: for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (painted >= paintCount) break outer;
      const row = maze.cells[y];
      if (row && row[x] === 'floor') {
        paintedCells.add(coordinateToKey({ x, y }));
        painted++;
      }
    }
  }

  return {
    maze,
    paintedCells,
    playerPosition: maze.startPosition,
    moveCount: 0,
  };
}

/**
 * Counts floor cells in a maze.
 */
function countFloorCells(maze: MazeState): number {
  let count = 0;
  for (const row of maze.cells) {
    for (const cell of row) {
      if (cell === 'floor') count++;
    }
  }
  return count;
}

describe('calculateProgress', () => {
  describe('boundary values', () => {
    it('returns 0.0 for no painted cells', () => {
      const maze = createAllFloorMaze(10);
      const state: MazeGameState = {
        maze,
        paintedCells: new Set<string>(),
        playerPosition: maze.startPosition,
        moveCount: 0,
      };
      const progress = calculateProgress(state);
      expect(progress).toBe(0.0);
    });

    it('returns 100.0 for all floor cells painted', () => {
      const maze = createAllFloorMaze(10);
      const totalFloorCells = countFloorCells(maze);
      const state = createStateWithPaintedFloorCells(maze, totalFloorCells);
      const progress = calculateProgress(state);
      expect(progress).toBe(100.0);
    });

    it('returns 1.0 for 1 cell painted in 10x10 all-floor maze', () => {
      const maze = createAllFloorMaze(10);
      const state = createStateWithPaintedFloorCells(maze, 1);
      const progress = calculateProgress(state);
      expect(progress).toBe(1.0);
    });

    it('returns 100.0 for maze with zero floor cells', () => {
      // Edge case: all obstacles (except start which must be floor)
      // Actually, start position must be floor, so minimum 1 floor cell
      const maze = createMazeWithObstacles(3, 8); // 9 cells, 8 obstacles, 1 floor (start)
      const state = createStateWithPaintedFloorCells(maze, 1);
      const progress = calculateProgress(state);
      expect(progress).toBe(100.0);
    });
  });

  describe('percentage calculations', () => {
    it('returns 50.0 for half painted cells', () => {
      const maze = createAllFloorMaze(10);
      const halfCells = countFloorCells(maze) / 2;
      const state = createStateWithPaintedFloorCells(maze, halfCells);
      const progress = calculateProgress(state);
      expect(progress).toBe(50.0);
    });

    it('returns 25.0 for quarter painted cells', () => {
      const maze = createAllFloorMaze(10);
      const quarterCells = countFloorCells(maze) / 4;
      const state = createStateWithPaintedFloorCells(maze, quarterCells);
      const progress = calculateProgress(state);
      expect(progress).toBe(25.0);
    });

    it('returns 10.0 for 10 cells painted in 10x10 all-floor maze', () => {
      const maze = createAllFloorMaze(10);
      const state = createStateWithPaintedFloorCells(maze, 10);
      const progress = calculateProgress(state);
      expect(progress).toBe(10.0);
    });
  });

  describe('precision', () => {
    it('rounds to one decimal place', () => {
      // 33 cells in a 100-cell maze = 33%
      const maze = createAllFloorMaze(10);
      const state = createStateWithPaintedFloorCells(maze, 33);
      const progress = calculateProgress(state);
      expect(progress).toBe(33.0);
    });

    it('handles fractional percentages correctly', () => {
      // 1 cell in 9 cells (3x3 maze) = 11.111...% -> 11.1%
      const maze = createAllFloorMaze(3);
      const state = createStateWithPaintedFloorCells(maze, 1);
      const progress = calculateProgress(state);
      expect(progress).toBe(11.1);
    });

    it('rounds up correctly (66.666... -> 66.7)', () => {
      // 6/9 = 66.666...% -> 66.7%
      const maze = createAllFloorMaze(3);
      const state = createStateWithPaintedFloorCells(maze, 6);
      const progress = calculateProgress(state);
      expect(progress).toBe(66.7);
    });

    it('returns exact decimal for nice fractions', () => {
      // 1 cell in 5x5 = 25 cells = 4%
      const maze = createAllFloorMaze(5);
      const state = createStateWithPaintedFloorCells(maze, 1);
      const progress = calculateProgress(state);
      expect(progress).toBe(4.0);
    });
  });

  describe('mazes with obstacles', () => {
    it('excludes obstacles from total count', () => {
      // 6x6 = 36 cells, 10 obstacles = 26 floor cells
      const maze = createMazeWithObstacles(6, 10);
      const floorCount = countFloorCells(maze);
      expect(floorCount).toBe(26);

      // Paint 13 floor cells = 50%
      const state = createStateWithPaintedFloorCells(maze, 13);
      const progress = calculateProgress(state);
      expect(progress).toBe(50.0);
    });

    it('calculates 100% when all floor cells are painted (ignoring obstacles)', () => {
      const maze = createMazeWithObstacles(6, 10);
      const floorCount = countFloorCells(maze);
      const state = createStateWithPaintedFloorCells(maze, floorCount);
      const progress = calculateProgress(state);
      expect(progress).toBe(100.0);
    });
  });

  describe('different maze sizes', () => {
    it('calculates correctly for 5x5 all-floor maze', () => {
      const maze = createAllFloorMaze(5);
      // 5x5 = 25 total cells, 5 painted = 20%
      const state = createStateWithPaintedFloorCells(maze, 5);
      const progress = calculateProgress(state);
      expect(progress).toBe(20.0);
    });

    it('calculates correctly for 15x15 all-floor maze', () => {
      const maze = createAllFloorMaze(15);
      // 15x15 = 225 total cells, 45 painted = 20%
      const state = createStateWithPaintedFloorCells(maze, 45);
      const progress = calculateProgress(state);
      expect(progress).toBe(20.0);
    });

    it('calculates correctly for 20x20 all-floor maze', () => {
      const maze = createAllFloorMaze(20);
      // 20x20 = 400 total cells, 100 painted = 25%
      const state = createStateWithPaintedFloorCells(maze, 100);
      const progress = calculateProgress(state);
      expect(progress).toBe(25.0);
    });
  });

  describe('initial state', () => {
    it('returns correct progress for initial game state', () => {
      const maze = createAllFloorMaze(10);
      const state = createInitialGameState(maze);
      // Initial state has 1 cell painted (start position)
      const progress = calculateProgress(state);
      expect(progress).toBe(1.0); // 1/100 = 1%
    });

    it('returns correct progress for generated maze with obstacles', () => {
      const maze = generateMaze('a'.repeat(64), 'easy');
      const state = createInitialGameState(maze);
      const floorCount = countFloorCells(maze);
      // Initial state has 1 cell painted
      const expectedProgress = Math.round((1 / floorCount) * 100 * 10) / 10;
      const progress = calculateProgress(state);
      expect(progress).toBe(expectedProgress);
    });
  });
});
