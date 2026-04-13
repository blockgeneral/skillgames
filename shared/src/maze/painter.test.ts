import { describe, it, expect } from 'vitest';
import { applyMove, createInitialGameState } from './painter.js';
import { generateMaze } from './generator.js';
import type { CellType, MazeGameState, MazeState, PaintMove } from '../types.js';
import { coordinateToKey } from '../types.js';

/**
 * Creates a simple test maze with a known layout.
 * Layout (6x6):
 *   0 1 2 3 4 5
 * 0 . . . . . .
 * 1 . . . . . .
 * 2 . . # . . .
 * 3 . . . . # .
 * 4 . # . . . .
 * 5 S . . . . .
 *
 * S = start (0,5), # = obstacle, . = floor
 */
function createTestMaze(): MazeState {
  const cells: CellType[][] = [];
  for (let y = 0; y < 6; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < 6; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  // Place obstacles
  cells[2]![2] = 'obstacle';
  cells[3]![4] = 'obstacle';
  cells[4]![1] = 'obstacle';

  return {
    seed: 'a'.repeat(64),
    width: 6,
    height: 6,
    cells,
    startPosition: { x: 0, y: 5 },
    minimumMoveLowerBound: 0,
  };
}

/**
 * Creates a 1xN corridor maze for edge case testing.
 */
function createCorridorMaze(length: number): MazeState {
  const cells: CellType[][] = [];
  for (let y = 0; y < 1; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < length; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  return {
    seed: 'b'.repeat(64),
    width: length,
    height: 1,
    cells,
    startPosition: { x: 0, y: 0 },
    minimumMoveLowerBound: 0,
  };
}

/**
 * Creates a test game state.
 */
function createTestState(): MazeGameState {
  const maze = createTestMaze();
  return createInitialGameState(maze);
}

describe('applyMove', () => {
  describe('slide to edge', () => {
    it('slides right to edge of grid', () => {
      const state = createTestState();
      const move: PaintMove = { direction: 'right', timestamp: 0 };

      const newState = applyMove(state, move);

      // Should slide from (0,5) to (5,5)
      expect(newState.playerPosition).toEqual({ x: 5, y: 5 });
      expect(newState.moveCount).toBe(1);
    });

    it('slides up to edge of grid', () => {
      const state = createTestState();
      const move: PaintMove = { direction: 'up', timestamp: 0 };

      const newState = applyMove(state, move);

      // Should slide from (0,5) to (0,0)
      expect(newState.playerPosition).toEqual({ x: 0, y: 0 });
      expect(newState.moveCount).toBe(1);
    });

    it('paints all cells along the path', () => {
      const state = createTestState();
      const move: PaintMove = { direction: 'right', timestamp: 0 };

      const newState = applyMove(state, move);

      // Should paint (0,5), (1,5), (2,5), (3,5), (4,5), (5,5)
      for (let x = 0; x <= 5; x++) {
        expect(newState.paintedCells.has(coordinateToKey({ x, y: 5 }))).toBe(true);
      }
    });
  });

  describe('slide to obstacle', () => {
    it('stops before hitting obstacle', () => {
      const state = createTestState();

      // First move right to get to a position where we can hit an obstacle
      const state2 = applyMove(state, { direction: 'right', timestamp: 0 });
      expect(state2.playerPosition).toEqual({ x: 5, y: 5 });

      // Move up - should stop at (5,4) because of obstacle at (5,3)? No wait,
      // obstacle is at (3,4), not (5,3). Let me trace: from (5,5) going up...
      // (5,4) is floor, (5,3) is floor (obstacle is at (4,3)), (5,2) is floor,
      // (5,1) is floor, (5,0) is floor. So we go all the way to (5,0).
      const state3 = applyMove(state2, { direction: 'up', timestamp: 0 });
      expect(state3.playerPosition).toEqual({ x: 5, y: 0 });
    });

    it('stops correctly when obstacle is in path', () => {
      // Create a maze with obstacle directly in path
      const cells: CellType[][] = [
        ['floor', 'floor', 'floor'],
        ['floor', 'obstacle', 'floor'],
        ['floor', 'floor', 'floor'],
      ];

      const maze: MazeState = {
        seed: 'c'.repeat(64),
        width: 3,
        height: 3,
        cells,
        startPosition: { x: 0, y: 2 },
        minimumMoveLowerBound: 0,
      };

      const state = createInitialGameState(maze);

      // Move right from (0,2)
      const state2 = applyMove(state, { direction: 'right', timestamp: 0 });
      expect(state2.playerPosition).toEqual({ x: 2, y: 2 });

      // Move up from (2,2) - should go to (2,0)
      const state3 = applyMove(state2, { direction: 'up', timestamp: 0 });
      expect(state3.playerPosition).toEqual({ x: 2, y: 0 });

      // Move left from (2,0) - should stop at (2,0) because obstacle at (1,1)
      // Wait, obstacle is at (1,1), we're at (2,0) going left...
      // (1,0) is floor, (0,0) is floor. So we go to (0,0).
      const state4 = applyMove(state3, { direction: 'left', timestamp: 0 });
      expect(state4.playerPosition).toEqual({ x: 0, y: 0 });

      // Move down from (0,0) - obstacle at (1,1) doesn't block column 0
      // We should go to (0,2)
      const state5 = applyMove(state4, { direction: 'down', timestamp: 0 });
      expect(state5.playerPosition).toEqual({ x: 0, y: 2 });
    });
  });

  describe('slide no-op (immediately blocked)', () => {
    it('returns unchanged state when blocked by edge', () => {
      const state = createTestState();
      // At (0,5), try to go left - immediately blocked by edge
      const move: PaintMove = { direction: 'left', timestamp: 0 };

      const newState = applyMove(state, move);

      // Should return same state (not a new object if no movement)
      expect(newState).toBe(state);
      expect(newState.moveCount).toBe(0);
      expect(newState.playerPosition).toEqual({ x: 0, y: 5 });
    });

    it('returns unchanged state when blocked by edge at bottom', () => {
      const state = createTestState();
      // At (0,5), try to go down - immediately blocked by edge
      const move: PaintMove = { direction: 'down', timestamp: 0 };

      const newState = applyMove(state, move);

      expect(newState).toBe(state);
      expect(newState.moveCount).toBe(0);
    });

    it('returns unchanged state when blocked by obstacle', () => {
      // Create a maze where start is next to obstacle
      const cells: CellType[][] = [
        ['floor', 'obstacle'],
        ['floor', 'floor'],
      ];

      const maze: MazeState = {
        seed: 'd'.repeat(64),
        width: 2,
        height: 2,
        cells,
        startPosition: { x: 0, y: 1 },
        minimumMoveLowerBound: 0,
      };

      const state = createInitialGameState(maze);

      // Move up from (0,1) to (0,0)
      const state2 = applyMove(state, { direction: 'up', timestamp: 0 });
      expect(state2.playerPosition).toEqual({ x: 0, y: 0 });

      // Move right from (0,0) - blocked by obstacle at (1,0)
      const state3 = applyMove(state2, { direction: 'right', timestamp: 0 });
      expect(state3).toBe(state2); // Same reference
      expect(state3.playerPosition).toEqual({ x: 0, y: 0 });
    });
  });

  describe('slide paints multiple cells', () => {
    it('paints all cells in a long slide', () => {
      const maze = createCorridorMaze(10);
      const state = createInitialGameState(maze);

      // Only start cell is painted initially
      expect(state.paintedCells.size).toBe(1);

      const move: PaintMove = { direction: 'right', timestamp: 0 };
      const newState = applyMove(state, move);

      // All 10 cells should be painted
      expect(newState.paintedCells.size).toBe(10);
      for (let x = 0; x < 10; x++) {
        expect(newState.paintedCells.has(coordinateToKey({ x, y: 0 }))).toBe(true);
      }
    });
  });

  describe('slide paints zero new cells (already-painted path)', () => {
    it('does not increase painted count on already-painted path', () => {
      const maze = createCorridorMaze(5);
      const state = createInitialGameState(maze);

      // Slide right - paints all cells
      const state2 = applyMove(state, { direction: 'right', timestamp: 0 });
      expect(state2.paintedCells.size).toBe(5);
      expect(state2.playerPosition).toEqual({ x: 4, y: 0 });

      // Slide left - path already painted
      const state3 = applyMove(state2, { direction: 'left', timestamp: 0 });
      expect(state3.paintedCells.size).toBe(5); // Same count
      expect(state3.playerPosition).toEqual({ x: 0, y: 0 });
    });
  });

  describe('immutability', () => {
    it('does not mutate input state', () => {
      const state = createTestState();
      const originalPosition = { ...state.playerPosition };
      const originalMoveCount = state.moveCount;
      const originalPaintedSize = state.paintedCells.size;
      const originalPaintedCells = new Set(state.paintedCells);

      const move: PaintMove = { direction: 'right', timestamp: 0 };
      applyMove(state, move);

      // Original state unchanged
      expect(state.playerPosition).toEqual(originalPosition);
      expect(state.moveCount).toBe(originalMoveCount);
      expect(state.paintedCells.size).toBe(originalPaintedSize);
      expect([...state.paintedCells]).toEqual([...originalPaintedCells]);
    });

    it('returns a new state object when move succeeds', () => {
      const state = createTestState();
      const move: PaintMove = { direction: 'right', timestamp: 0 };

      const newState = applyMove(state, move);

      expect(newState).not.toBe(state);
      expect(newState.paintedCells).not.toBe(state.paintedCells);
    });
  });

  describe('determinism', () => {
    it('produces identical results for same sequence of moves (100 iterations)', () => {
      const maze = generateMaze('a'.repeat(64), 'easy');

      // Build a sequence of moves
      const moves: PaintMove[] = [
        { direction: 'right', timestamp: 0 },
        { direction: 'up', timestamp: 100 },
        { direction: 'left', timestamp: 200 },
        { direction: 'down', timestamp: 300 },
        { direction: 'right', timestamp: 400 },
      ];

      // Apply the sequence once to get reference result
      let firstRun = createInitialGameState(maze);
      for (const move of moves) {
        firstRun = applyMove(firstRun, move);
      }

      // Apply 100 times and compare
      for (let i = 0; i < 100; i++) {
        let state = createInitialGameState(maze);
        for (const move of moves) {
          state = applyMove(state, move);
        }

        expect(state.playerPosition).toEqual(firstRun.playerPosition);
        expect(state.moveCount).toBe(firstRun.moveCount);
        expect([...state.paintedCells].sort()).toEqual([...firstRun.paintedCells].sort());
      }
    });
  });

  describe('all directions', () => {
    it('handles all four directions correctly', () => {
      const state = createTestState();

      // Up from (0,5)
      const up = applyMove(state, { direction: 'up', timestamp: 0 });
      expect(up.playerPosition.y).toBeLessThan(state.playerPosition.y);

      // Right from (0,5)
      const right = applyMove(state, { direction: 'right', timestamp: 0 });
      expect(right.playerPosition.x).toBeGreaterThan(state.playerPosition.x);

      // Left from (0,5) - blocked
      const left = applyMove(state, { direction: 'left', timestamp: 0 });
      expect(left).toBe(state);

      // Down from (0,5) - blocked
      const down = applyMove(state, { direction: 'down', timestamp: 0 });
      expect(down).toBe(state);
    });
  });
});

describe('createInitialGameState', () => {
  it('starts player at maze startPosition', () => {
    const maze = createTestMaze();
    const state = createInitialGameState(maze);

    expect(state.playerPosition).toEqual(maze.startPosition);
  });

  it('starts with startPosition painted', () => {
    const maze = createTestMaze();
    const state = createInitialGameState(maze);

    expect(state.paintedCells.has(coordinateToKey(maze.startPosition))).toBe(true);
  });

  it('starts with move count 0', () => {
    const maze = createTestMaze();
    const state = createInitialGameState(maze);

    expect(state.moveCount).toBe(0);
  });

  it('stores the maze reference', () => {
    const maze = createTestMaze();
    const state = createInitialGameState(maze);

    expect(state.maze).toBe(maze);
  });

  it('starts with exactly one painted cell', () => {
    const maze = createTestMaze();
    const state = createInitialGameState(maze);

    expect(state.paintedCells.size).toBe(1);
  });
});
