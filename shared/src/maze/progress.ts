import type { MazeGameState } from '../types.js';

/**
 * Counts the number of floor cells in the maze.
 * Obstacles and void cells are not counted.
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
 * Calculates the paint progress as a percentage from 0 to 100.
 *
 * Formula: (paintedFloorCells / totalFloorCells) * 100
 *
 * Returns a number with exactly one decimal of precision.
 * Only floor cells are counted — obstacles and void cells are excluded
 * from both the numerator and denominator.
 *
 * @param state - The current game state
 * @returns Progress percentage from 0.0 to 100.0
 */
export function calculateProgress(state: MazeGameState): number {
  const totalFloorCells = countFloorCells(state);

  if (totalFloorCells === 0) {
    return 100.0;
  }

  const paintedCount = state.paintedCells.size;
  const progress = (paintedCount / totalFloorCells) * 100;

  // Round to one decimal place
  return Math.round(progress * 10) / 10;
}
