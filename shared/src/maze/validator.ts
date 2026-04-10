import type { CellType, MazeGameState } from '../types.js';
import { keyToCoordinate } from '../types.js';

/**
 * Result of game state validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Gets the cell type at a coordinate, returning undefined if out of bounds.
 */
function getCellType(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  x: number,
  y: number
): CellType | undefined {
  const row = cells[y];
  if (!row) return undefined;
  return row[x];
}

/**
 * Counts the number of floor cells in the maze.
 */
function countFloorCells(state: MazeGameState): number {
  let count = 0;
  for (const row of state.maze.cells) {
    for (const cell of row) {
      if (cell === 'floor') {
        count++;
      }
    }
  }
  return count;
}

/**
 * Checks if the paint is complete (every floor cell is painted).
 *
 * @param state - The game state to check
 * @returns true if every floor cell is painted
 */
export function isPaintComplete(state: MazeGameState): boolean {
  const totalFloorCells = countFloorCells(state);
  return state.paintedCells.size >= totalFloorCells;
}

/**
 * Checks if a coordinate is within the maze bounds.
 */
function isInBounds(state: MazeGameState, x: number, y: number): boolean {
  return x >= 0 && x < state.maze.width && y >= 0 && y < state.maze.height;
}

/**
 * Validates the structural integrity of a game state.
 *
 * Checks:
 * - Painted set contains only floor coordinates (never obstacle or void)
 * - Player position is on a floor cell
 * - Move count is non-negative
 * - Maze dimensions match the cells array
 * - Start position is a floor cell
 *
 * @param state - The game state to validate
 * @returns ValidationResult with valid flag and optional reason on failure
 */
export function isValidGameState(state: MazeGameState): ValidationResult {
  // Check move count is non-negative
  if (state.moveCount < 0) {
    return {
      valid: false,
      reason: `Move count must be non-negative, got ${state.moveCount}`,
    };
  }

  // Check maze dimensions match cells array
  if (state.maze.cells.length !== state.maze.height) {
    return {
      valid: false,
      reason: `Maze height (${state.maze.height}) does not match cells array length (${state.maze.cells.length})`,
    };
  }

  for (let y = 0; y < state.maze.cells.length; y++) {
    const row = state.maze.cells[y];
    if (!row || row.length !== state.maze.width) {
      return {
        valid: false,
        reason: `Row ${y} width (${row?.length ?? 0}) does not match maze width (${state.maze.width})`,
      };
    }
  }

  // Check start position is a floor cell
  const startCellType = getCellType(
    state.maze.cells,
    state.maze.startPosition.x,
    state.maze.startPosition.y
  );
  if (startCellType !== 'floor') {
    return {
      valid: false,
      reason: `Start position (${state.maze.startPosition.x},${state.maze.startPosition.y}) is not a floor cell (got ${startCellType})`,
    };
  }

  // Check player position is in-bounds
  if (!isInBounds(state, state.playerPosition.x, state.playerPosition.y)) {
    return {
      valid: false,
      reason: `Player position (${state.playerPosition.x},${state.playerPosition.y}) is out of bounds`,
    };
  }

  // Check player position is on a floor cell
  const playerCellType = getCellType(
    state.maze.cells,
    state.playerPosition.x,
    state.playerPosition.y
  );
  if (playerCellType !== 'floor') {
    return {
      valid: false,
      reason: `Player position (${state.playerPosition.x},${state.playerPosition.y}) is not a floor cell (got ${playerCellType})`,
    };
  }

  // Check all painted cells are valid floor cells
  for (const key of state.paintedCells) {
    let coord;
    try {
      coord = keyToCoordinate(key);
    } catch {
      return {
        valid: false,
        reason: `Invalid painted cell key: ${key}`,
      };
    }

    if (!isInBounds(state, coord.x, coord.y)) {
      return {
        valid: false,
        reason: `Painted cell (${coord.x},${coord.y}) is out of bounds`,
      };
    }

    const cellType = getCellType(state.maze.cells, coord.x, coord.y);
    if (cellType !== 'floor') {
      return {
        valid: false,
        reason: `Painted cell (${coord.x},${coord.y}) is not a floor cell (got ${cellType})`,
      };
    }
  }

  return { valid: true };
}
