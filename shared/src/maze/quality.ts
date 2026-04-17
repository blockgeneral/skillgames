import type { MazeState, Direction } from '../types.js';
import { simulateSlide } from './painter.js';

const DIRECTIONS: ReadonlyArray<Direction> = ['up', 'down', 'left', 'right'];

/**
 * Returns true if ANY floor cell in the maze has ≤1 exit direction.
 *
 * A floor cell's "exit count" = number of directions where the ball can
 * actually slide (move ≥1 cell). Cells with 0-1 exits are dead ends —
 * the player enters, paints, and must reverse out the same way. This
 * reduces decision depth and makes the puzzle trivially easy in that area.
 *
 * Used as a post-generation quality gate: reject and retry levels that
 * have dead ends.
 */
export function hasDeadEnds(maze: MazeState): boolean {
  const { cells, width, height } = maze;
  for (let y = 0; y < height; y++) {
    const row = cells[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      if (row[x] !== 'floor') continue;
      let exits = 0;
      for (const dir of DIRECTIONS) {
        const result = simulateSlide(cells, x, y, dir, width, height);
        if (result.path.length > 1) exits++;
      }
      if (exits <= 1) return true;
    }
  }
  return false;
}
