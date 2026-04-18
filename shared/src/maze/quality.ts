import type { CellType, MazeState, Direction } from '../types.js';
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
 * Checks if any floor cell in a local neighborhood has ≤1 slide exit.
 */
function hasLocalDeadEnd(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  cx: number, cy: number,
  width: number, height: number,
): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (cells[ny]?.[nx] !== 'floor') continue;
      let exits = 0;
      for (const dir of DIRECTIONS) {
        const result = simulateSlide(cells, nx, ny, dir, width, height);
        if (result.path.length > 1) exits++;
      }
      if (exits <= 1) return true;
    }
  }
  return false;
}

/**
 * Narrows a maze by converting open-area floor cells to obstacles,
 * creating corridors. Validates solvability and dead-end freedom after
 * each conversion.
 */
export function narrowMaze(
  maze: MazeState,
  targetCoverage: number,
  rng: () => number,
): MazeState {
  const { width, height, startPosition } = maze;
  // Clone cells into mutable grid
  const grid: CellType[][] = [];
  for (let y = 0; y < height; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < width; x++) row.push(maze.cells[y]![x]!);
    grid.push(row);
  }

  const interiorArea = (width - 2) * (height - 2);
  const targetFloors = Math.floor(interiorArea * targetCoverage);

  const countFloors = (): number => {
    let n = 0;
    for (const r of grid) for (const c of r) if (c === 'floor') n++;
    return n;
  };

  const makeTempMaze = (): MazeState => ({
    ...maze,
    cells: grid.map(r => Object.freeze([...r])) as ReadonlyArray<ReadonlyArray<CellType>>,
  });

  for (let attempt = 0; attempt < 500; attempt++) {
    if (countFloors() <= targetFloors) break;

    // Find interior floor cells with ≥4 floor neighbors (open area cells)
    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y]![x] !== 'floor') continue;
        if (x === startPosition.x && y === startPosition.y) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny]![nx] === 'floor') {
              neighbors++;
            }
          }
        }
        if (neighbors >= 4) candidates.push({ x, y });
      }
    }

    if (candidates.length === 0) break;

    // Shuffle and try the first candidate
    const pickIdx = Math.floor(rng() * candidates.length);
    const pick = candidates[pickIdx]!;

    // Convert to obstacle
    grid[pick.y]![pick.x] = 'obstacle';

    // Validate
    const temp = makeTempMaze();
    if (!isSolvable(temp) || hasLocalDeadEnd(grid, pick.x, pick.y, width, height)) {
      grid[pick.y]![pick.x] = 'floor'; // revert
      continue;
    }
  }

  // Freeze the final grid
  const frozenCells = Object.freeze(grid.map(r => Object.freeze([...r])));
  return {
    ...maze,
    cells: frozenCells,
  };
}

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
