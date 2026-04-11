import type { CellType, Coordinate, Direction, MazeGameState, PaintMove } from '../types.js';
import { coordinateToKey } from '../types.js';

/**
 * Gets the direction vector for a given direction.
 */
function getDirectionVector(direction: Direction): { dx: number; dy: number } {
  switch (direction) {
    case 'up':
      return { dx: 0, dy: -1 };
    case 'down':
      return { dx: 0, dy: 1 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'right':
      return { dx: 1, dy: 0 };
  }
}

/**
 * Checks if a coordinate is within grid bounds.
 */
function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
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
 * Simulates a slide from the current position in the given direction.
 * Returns the path of coordinates traveled (including start and end).
 */
export function simulateSlide(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  startX: number,
  startY: number,
  direction: Direction,
  width: number,
  height: number
): { path: Coordinate[]; destination: Coordinate } {
  const { dx, dy } = getDirectionVector(direction);
  const path: Coordinate[] = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;

  while (true) {
    const nextX = x + dx;
    const nextY = y + dy;

    // Check if next position is out of bounds
    if (!isInBounds(nextX, nextY, width, height)) {
      break;
    }

    // Check if next cell is not a floor (obstacle, void, or undefined)
    const nextCell = getCellType(cells, nextX, nextY);
    if (nextCell !== 'floor') {
      break;
    }

    // Move to next position
    x = nextX;
    y = nextY;
    path.push({ x, y });
  }

  return {
    path,
    destination: { x, y },
  };
}

/**
 * Applies a slide move to the game state, returning a new state.
 *
 * The ball slides in the chosen direction until it hits an obstacle, void cell,
 * or the edge of the grid. Every floor cell along the path becomes painted.
 *
 * If the ball can't move in the chosen direction (immediately blocked),
 * the state is returned unchanged — the move is a no-op, not an error.
 *
 * @param state - The current game state (not mutated)
 * @param move - The move to apply (direction and timestamp)
 * @returns A new game state with the move applied
 */
export function applyMove(state: MazeGameState, move: PaintMove): MazeGameState {
  const { maze, paintedCells, playerPosition, moveCount } = state;
  const { direction } = move;

  // Simulate the slide
  const { path, destination } = simulateSlide(
    maze.cells,
    playerPosition.x,
    playerPosition.y,
    direction,
    maze.width,
    maze.height
  );

  // If the ball didn't move (path only contains starting position), return unchanged state
  if (path.length === 1) {
    return state;
  }

  // Create new painted cells set (copy of existing)
  const newPaintedCells = new Set(paintedCells);

  // Paint all cells along the path
  for (const coord of path) {
    newPaintedCells.add(coordinateToKey(coord));
  }

  // Return new state
  return {
    maze,
    paintedCells: newPaintedCells,
    playerPosition: destination,
    moveCount: moveCount + 1,
  };
}

/**
 * Creates an initial game state for a slide puzzle.
 * Ball starts at the maze's start position with that cell painted.
 */
export function createInitialGameState(maze: MazeGameState['maze']): MazeGameState {
  const paintedCells = new Set<string>();
  paintedCells.add(coordinateToKey(maze.startPosition));

  return {
    maze,
    paintedCells,
    playerPosition: { x: maze.startPosition.x, y: maze.startPosition.y },
    moveCount: 0,
  };
}
