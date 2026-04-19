import type { MazeState, Direction } from '../types.js';
import { simulateSlide } from './painter.js';

const DIRECTIONS: ReadonlyArray<Direction> = ['up', 'down', 'left', 'right'];

/**
 * Checks if every floor cell is paintable via some sequence of slides
 * from the start position. Uses BFS over reachable slide positions.
 */
export function isSolvable(maze: MazeState): boolean {
  const { cells, width, height, startPosition } = maze;
  const sx = startPosition.x, sy = startPosition.y;
  if (cells[sy]?.[sx] !== 'floor') return false;

  const reachable = new Set<string>([`${sx},${sy}`]);
  const paintable = new Set<string>();
  const queue: Array<[number, number]> = [[sx, sy]];

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const { path } = simulateSlide(cells, x, y, dir, width, height);
      for (const p of path) paintable.add(`${p.x},${p.y}`);
      if (path.length > 1) {
        const end = path[path.length - 1]!;
        const key = `${end.x},${end.y}`;
        if (!reachable.has(key)) {
          reachable.add(key);
          queue.push([end.x, end.y]);
        }
      }
    }
  }

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (cells[y]?.[x] === 'floor' && !paintable.has(`${x},${y}`))
        return false;
  return true;
}

/**
 * Returns true if ANY floor cell in the maze has ≤1 exit direction.
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
