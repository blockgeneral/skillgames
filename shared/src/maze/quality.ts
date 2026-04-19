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

  // Strong connectivity: verify every reachable position can return to start.
  // Build forward adjacency: position -> set of positions it can reach
  const forwardEdges = new Map<string, Set<string>>();
  for (const key of reachable) {
    const [px, py] = key.split(',').map(Number);
    const targets = new Set<string>();
    for (const dir of DIRECTIONS) {
      const { path } = simulateSlide(cells, px!, py!, dir, width, height);
      if (path.length > 1) {
        const end = path[path.length - 1]!;
        targets.add(`${end.x},${end.y}`);
      }
    }
    forwardEdges.set(key, targets);
  }

  // Build reverse adjacency
  const reverseEdges = new Map<string, Set<string>>();
  for (const key of reachable) reverseEdges.set(key, new Set());
  for (const [from, targets] of forwardEdges) {
    for (const to of targets) {
      reverseEdges.get(to)?.add(from);
    }
  }

  // Reverse BFS from start: find all positions that CAN REACH start
  const startKey = `${sx},${sy}`;
  const canReachStart = new Set<string>([startKey]);
  const revQueue: string[] = [startKey];
  while (revQueue.length > 0) {
    const current = revQueue.shift()!;
    const preds = reverseEdges.get(current);
    if (preds) {
      for (const pred of preds) {
        if (!canReachStart.has(pred)) {
          canReachStart.add(pred);
          revQueue.push(pred);
        }
      }
    }
  }

  // Every reachable position must also be able to reach start
  for (const key of reachable) {
    if (!canReachStart.has(key)) return false;
  }

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
