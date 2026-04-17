import { describe, it, expect } from 'vitest';
import { isPaintComplete, isValidGameState } from './validator.js';
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
 * Creates a maze with specific obstacles at given positions.
 */
function createMazeWithSpecificObstacles(
  size: number,
  obstacles: Array<{ x: number; y: number }>
): MazeState {
  const cells: CellType[][] = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  for (const obs of obstacles) {
    cells[obs.y]![obs.x] = 'obstacle';
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
 * Creates a valid game state for testing.
 */
function createValidState(size: number = 10): MazeGameState {
  const maze = createAllFloorMaze(size);
  return createInitialGameState(maze);
}

/**
 * Creates a fully painted game state (all floor cells painted).
 */
function createFullyPaintedState(size: number = 10): MazeGameState {
  const maze = createAllFloorMaze(size);
  const paintedCells = new Set<string>();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = maze.cells[y];
      if (row && row[x] === 'floor') {
        paintedCells.add(coordinateToKey({ x, y }));
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

describe('isPaintComplete', () => {
  it('returns false for initial state', () => {
    const state = createValidState();
    expect(isPaintComplete(state)).toBe(false);
  });

  it('returns false for partially painted maze', () => {
    const state = createValidState(10);
    // Add some more painted cells (ensuring they are floor cells)
    const newPainted = new Set(state.paintedCells);
    newPainted.add('1,9'); // bottom row, floor cell
    newPainted.add('2,9');

    const newState: MazeGameState = { ...state, paintedCells: newPainted };
    expect(isPaintComplete(newState)).toBe(false);
  });

  it('returns true when all floor cells are painted', () => {
    const state = createFullyPaintedState(10);
    expect(isPaintComplete(state)).toBe(true);
  });

  it('returns true when painted cells exceed floor count (edge case)', () => {
    const state = createFullyPaintedState(5);
    // This would be an invalid state, but test the >= logic
    const newPainted = new Set(state.paintedCells);
    newPainted.add('100,100'); // out of bounds, wouldn't be valid but tests the logic

    const newState: MazeGameState = { ...state, paintedCells: newPainted };
    expect(isPaintComplete(newState)).toBe(true);
  });

  it('returns true for maze with obstacles when all floor cells painted', () => {
    const maze = createMazeWithSpecificObstacles(5, [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    const floorCount = countFloorCells(maze);
    expect(floorCount).toBe(22); // 25 - 3 = 22

    // Paint all floor cells
    const paintedCells = new Set<string>();
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const row = maze.cells[y];
        if (row && row[x] === 'floor') {
          paintedCells.add(coordinateToKey({ x, y }));
        }
      }
    }

    const state: MazeGameState = {
      maze,
      paintedCells,
      playerPosition: maze.startPosition,
      moveCount: 0,
    };

    expect(isPaintComplete(state)).toBe(true);
  });
});

describe('isValidGameState', () => {
  describe('valid states', () => {
    it('returns valid for properly constructed initial state', () => {
      const state = createValidState();
      const result = isValidGameState(state);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns valid for fully painted state', () => {
      const state = createFullyPaintedState();
      const result = isValidGameState(state);
      expect(result.valid).toBe(true);
    });

    it('returns valid for state with positive move count', () => {
      const state = createValidState();
      const stateWithMoves: MazeGameState = {
        ...state,
        moveCount: 50,
      };
      const result = isValidGameState(stateWithMoves);
      expect(result.valid).toBe(true);
    });

    it('returns valid for generated maze', () => {
      const maze = generateMaze('a'.repeat(64), 'medium');
      const state = createInitialGameState(maze);
      const result = isValidGameState(state);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid player position', () => {
    it('rejects negative x position', () => {
      const state = createValidState();
      const invalidState: MazeGameState = {
        ...state,
        playerPosition: { x: -1, y: 0 },
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects negative y position', () => {
      const state = createValidState();
      const invalidState: MazeGameState = {
        ...state,
        playerPosition: { x: 0, y: -1 },
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects x position >= width', () => {
      const state = createValidState(10);
      const invalidState: MazeGameState = {
        ...state,
        playerPosition: { x: 10, y: 0 },
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects y position >= height', () => {
      const state = createValidState(10);
      const invalidState: MazeGameState = {
        ...state,
        playerPosition: { x: 0, y: 10 },
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects player position on obstacle cell', () => {
      const maze = createMazeWithSpecificObstacles(5, [{ x: 2, y: 2 }]);
      const state: MazeGameState = {
        maze,
        paintedCells: new Set([coordinateToKey(maze.startPosition)]),
        playerPosition: { x: 2, y: 2 }, // obstacle position
        moveCount: 0,
      };
      const result = isValidGameState(state);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not a floor cell');
    });
  });

  describe('invalid move count', () => {
    it('rejects negative move count', () => {
      const state = createValidState();
      const invalidState: MazeGameState = {
        ...state,
        moveCount: -1,
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('non-negative');
    });

    it('rejects large negative move count', () => {
      const state = createValidState();
      const invalidState: MazeGameState = {
        ...state,
        moveCount: -100,
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('non-negative');
    });
  });

  describe('invalid painted cells', () => {
    it('rejects out of bounds painted cell (negative x)', () => {
      const state = createValidState();
      const newPainted = new Set(state.paintedCells);
      newPainted.add('-1,0');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects out of bounds painted cell (negative y)', () => {
      const state = createValidState();
      const newPainted = new Set(state.paintedCells);
      newPainted.add('0,-1');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects out of bounds painted cell (x >= width)', () => {
      const state = createValidState(10);
      const newPainted = new Set(state.paintedCells);
      newPainted.add('10,0');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects out of bounds painted cell (y >= height)', () => {
      const state = createValidState(10);
      const newPainted = new Set(state.paintedCells);
      newPainted.add('0,10');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects malformed painted cell key (no comma)', () => {
      const state = createValidState();
      const newPainted = new Set(state.paintedCells);
      newPainted.add('00');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid painted cell key');
    });

    it('rejects malformed painted cell key (non-numeric)', () => {
      const state = createValidState();
      const newPainted = new Set(state.paintedCells);
      newPainted.add('a,b');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid painted cell key');
    });

    it('rejects malformed painted cell key (extra commas)', () => {
      const state = createValidState();
      const newPainted = new Set(state.paintedCells);
      newPainted.add('0,0,0');
      const invalidState: MazeGameState = { ...state, paintedCells: newPainted };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid painted cell key');
    });

    it('rejects painted cell on obstacle', () => {
      const maze = createMazeWithSpecificObstacles(5, [{ x: 2, y: 2 }]);
      const paintedCells = new Set([
        coordinateToKey(maze.startPosition),
        coordinateToKey({ x: 2, y: 2 }), // obstacle
      ]);
      const state: MazeGameState = {
        maze,
        paintedCells,
        playerPosition: maze.startPosition,
        moveCount: 0,
      };
      const result = isValidGameState(state);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not a floor cell');
    });
  });

  describe('invalid start position', () => {
    it('rejects maze with start position on obstacle', () => {
      // Create a maze where start would be on obstacle (invalid construction)
      const cells: CellType[][] = [];
      for (let y = 0; y < 5; y++) {
        const row: CellType[] = [];
        for (let x = 0; x < 5; x++) {
          row.push('floor');
        }
        cells.push(row);
      }
      // Put obstacle at start position
      cells[4]![0] = 'obstacle';

      const badMaze: MazeState = {
        seed: 'c'.repeat(64),
        width: 5,
        height: 5,
        cells,
        startPosition: { x: 0, y: 4 },
        minimumMoveLowerBound: 0,
      };

      const state: MazeGameState = {
        maze: badMaze,
        paintedCells: new Set<string>(),
        playerPosition: { x: 1, y: 4 }, // valid floor position
        moveCount: 0,
      };

      const result = isValidGameState(state);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Start position');
      expect(result.reason).toContain('not a floor cell');
    });
  });

  describe('maze dimension mismatches', () => {
    it('rejects when cells array height does not match maze height', () => {
      const state = createValidState(10);
      // Create a maze with mismatched height
      const badMaze: MazeState = {
        ...state.maze,
        height: 15, // Says 15, but cells array has 10 rows
      };
      const invalidState: MazeGameState = {
        ...state,
        maze: badMaze,
      };
      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('rejects when row width does not match maze width', () => {
      const maze = createAllFloorMaze(10);

      // Create a maze with a mismatched width declaration
      const badMaze: MazeState = {
        ...maze,
        width: 15, // Says 15, but rows have 10 cells
      };

      const invalidState: MazeGameState = {
        maze: badMaze,
        paintedCells: new Set([coordinateToKey(badMaze.startPosition)]),
        playerPosition: badMaze.startPosition,
        moveCount: 0,
      };

      const result = isValidGameState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not match');
    });
  });

  describe('edge cases', () => {
    it('accepts zero move count', () => {
      const state = createValidState();
      const result = isValidGameState(state);
      expect(result.valid).toBe(true);
    });

    it('accepts empty painted cells set', () => {
      const state = createValidState();
      const emptyState: MazeGameState = {
        ...state,
        paintedCells: new Set<string>(),
      };
      const result = isValidGameState(emptyState);
      expect(result.valid).toBe(true);
    });

    it('accepts player at all corner positions (when floor)', () => {
      const state = createValidState(10);

      // In all-floor maze, all corners are valid
      const corners = [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
        { x: 0, y: 9 },
        { x: 9, y: 9 },
      ];

      for (const corner of corners) {
        const cornerState: MazeGameState = {
          ...state,
          playerPosition: corner,
        };
        const result = isValidGameState(cornerState);
        expect(result.valid).toBe(true);
      }
    });

    it('accepts large move count', () => {
      const state = createValidState();
      const largeMovesState: MazeGameState = {
        ...state,
        moveCount: 1000000,
      };
      const result = isValidGameState(largeMovesState);
      expect(result.valid).toBe(true);
    });
  });
});
