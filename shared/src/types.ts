/**
 * Coordinate system documentation:
 * - Origin: top-left corner of the grid
 * - X-axis: increases rightward (0 = leftmost column)
 * - Y-axis: increases downward (0 = topmost row)
 * - Bottom-left start position: (0, height - 1)
 *
 * This matches standard SVG/screen coordinates.
 */

/** A seed is a hex string. Always 64 chars (256 bits). */
export type Seed = string;

/** Difficulty determines grid size and obstacle density. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Direction of ball movement in the slide puzzle. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** A coordinate in the grid. */
export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

/**
 * Cell types in the slide puzzle grid.
 * - floor: paintable, walkable cell
 * - obstacle: blocks movement, not paintable
 * - void: outside playable area, treated as wall (reserved for v1.5 irregular shapes)
 */
export type CellType = 'floor' | 'obstacle' | 'void';

/**
 * Configuration for each difficulty level.
 */
export interface DifficultyConfig {
  /** Grid width and height (square grids) */
  readonly size: number;
  /** Target percentage of cells to be obstacles (0-100) */
  readonly obstaclePercent: number;
}

/**
 * Maps difficulty to grid configuration.
 * Obstacle percentages are initial values, expect to tune after playtesting.
 */
export const DIFFICULTY_CONFIGS: Readonly<Record<Difficulty, DifficultyConfig>> = {
  easy: { size: 6, obstaclePercent: 10 },
  medium: { size: 9, obstaclePercent: 15 },
  hard: { size: 12, obstaclePercent: 18 },
};

/**
 * A slide puzzle level.
 * `cells[y][x]` returns the cell type at column x, row y.
 */
export interface MazeState {
  readonly seed: Seed;
  readonly width: number;
  readonly height: number;
  /** Grid of cell types. cells[y][x] for top-left origin, y-down. */
  readonly cells: ReadonlyArray<ReadonlyArray<CellType>>;
  /** Starting position for the ball (always bottom-left floor cell). */
  readonly startPosition: Coordinate;
}

/**
 * Runtime representation of painted cells using a Set of "x,y" string keys.
 * Use coordinateToKey and keyToCoordinate helpers for conversion.
 */
export type PaintedCellsRuntime = Set<string>;

/**
 * Serializable representation of painted cells as a sorted array of [x, y] tuples.
 * Used for protocol messages and replays.
 */
export type PaintedCellsSerialized = ReadonlyArray<readonly [number, number]>;

/**
 * Converts a coordinate to a string key for use in PaintedCellsRuntime.
 */
export function coordinateToKey(coord: Coordinate): string {
  return `${coord.x},${coord.y}`;
}

/**
 * Converts a string key back to a coordinate.
 * @throws Error if the key is malformed
 */
export function keyToCoordinate(key: string): Coordinate {
  const parts = key.split(',');
  if (parts.length !== 2) {
    throw new Error(`Invalid coordinate key: ${key}`);
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Invalid coordinate key: ${key}`);
  }
  return { x, y };
}

/**
 * Converts a runtime Set of painted cells to the serializable array format.
 * The result is sorted by y, then by x for deterministic serialization.
 */
export function paintedCellsToSerialized(cells: PaintedCellsRuntime): PaintedCellsSerialized {
  const coordinates: Array<readonly [number, number]> = [];
  for (const key of cells) {
    const coord = keyToCoordinate(key);
    coordinates.push([coord.x, coord.y] as const);
  }
  // Sort by y first, then by x for deterministic ordering
  coordinates.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] - b[0];
  });
  return coordinates;
}

/**
 * Converts a serialized array of painted cells to the runtime Set format.
 */
export function paintedCellsFromSerialized(cells: PaintedCellsSerialized): PaintedCellsRuntime {
  const set = new Set<string>();
  for (const [x, y] of cells) {
    set.add(coordinateToKey({ x, y }));
  }
  return set;
}

/**
 * A single slide move in the puzzle.
 * The destination is computed by the slide logic based on the direction.
 */
export interface PaintMove {
  /** Direction the ball slides */
  readonly direction: Direction;
  /** Milliseconds since match start */
  readonly timestamp: number;
}

/**
 * The live game state during a Maze Paint match.
 */
export interface MazeGameState {
  /** The static puzzle layout */
  readonly maze: MazeState;
  /** Set of painted floor cell coordinates as "x,y" strings */
  readonly paintedCells: PaintedCellsRuntime;
  /** Current ball position (always on a floor cell) */
  readonly playerPosition: Coordinate;
  /** Number of moves made */
  readonly moveCount: number;
}
