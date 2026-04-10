import type { CellType, Coordinate, Direction, MazeState, Seed } from '../types.js';
import { createPrng, shuffle } from '../prng.js';

/**
 * Validates that a seed is a valid 64-character hexadecimal string
 * and normalizes it to lowercase.
 *
 * @param seed - The seed to validate
 * @returns The normalized (lowercase) seed
 * @throws Error if the seed is invalid
 */
function validateAndNormalizeSeed(seed: string): string {
  if (seed.length !== 64) {
    throw new Error(`Seed must be exactly 64 characters, got ${seed.length}`);
  }

  if (!/^[0-9a-fA-F]+$/.test(seed)) {
    throw new Error('Seed must be a valid hexadecimal string');
  }

  return seed.toLowerCase();
}

/**
 * Validates that the size is within acceptable bounds.
 *
 * @param size - The grid size to validate
 * @throws Error if the size is out of bounds
 */
function validateSize(size: number): void {
  if (size < 2) {
    throw new Error(`Size must be at least 2, got ${size}`);
  }

  if (size > 100) {
    throw new Error(`Size must be at most 100, got ${size}`);
  }
}

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
 * Simulates a slide from a position in a direction.
 * Returns the final position after sliding until hitting an obstacle, void, or edge.
 */
function simulateSlide(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  startX: number,
  startY: number,
  direction: Direction,
  width: number,
  height: number
): Coordinate {
  const { dx, dy } = getDirectionVector(direction);
  let x = startX;
  let y = startY;

  while (true) {
    const nextX = x + dx;
    const nextY = y + dy;

    // Check if next position is out of bounds
    if (!isInBounds(nextX, nextY, width, height)) {
      break;
    }

    // Check if next cell is not a floor
    const nextCell = cells[nextY]?.[nextX];
    if (nextCell !== 'floor') {
      break;
    }

    // Move to next position
    x = nextX;
    y = nextY;
  }

  return { x, y };
}

/**
 * Finds cells that are unreachable via slides.
 * Returns coordinates of floor cells that cannot be painted.
 */
function findUnreachableCells(
  cells: ReadonlyArray<ReadonlyArray<CellType>>,
  startPosition: Coordinate,
  width: number,
  height: number
): Coordinate[] {
  // Find all reachable cells using BFS
  const reachable = new Set<string>();
  const visited = new Set<string>();
  const queue: Coordinate[] = [startPosition];

  reachable.add(`${startPosition.x},${startPosition.y}`);
  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.x},${current.y}`;

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    for (const direction of directions) {
      const dest = simulateSlide(cells, current.x, current.y, direction, width, height);

      // Mark all cells along the path as reachable
      const { dx, dy } = getDirectionVector(direction);
      let x = current.x;
      let y = current.y;

      while (x !== dest.x || y !== dest.y) {
        x += dx;
        y += dy;
        reachable.add(`${x},${y}`);
      }

      const destKey = `${dest.x},${dest.y}`;
      if (!visited.has(destKey)) {
        queue.push(dest);
      }
    }
  }

  // Find unreachable floor cells
  const unreachable: Coordinate[] = [];
  for (let y = 0; y < height; y++) {
    const row = cells[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      if (row[x] === 'floor' && !reachable.has(`${x},${y}`)) {
        unreachable.push({ x, y });
      }
    }
  }

  return unreachable;
}

/**
 * Generates a slide puzzle level using constructive placement.
 *
 * The algorithm:
 * 1. Start with random obstacle placement
 * 2. Check for unreachable floor cells
 * 3. If unreachable, strategically add/remove obstacles to create access paths
 * 4. Continue until solvable
 *
 * This guarantees a solvable configuration by construction.
 */
function generateLevel(
  seed: string,
  size: number,
  obstaclePercent: number,
  startPosition: Coordinate
): CellType[][] {
  const prng = createPrng(seed);

  // Initialize grid with all floor cells
  const cells: CellType[][] = [];
  for (let y = 0; y < size; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < size; x++) {
      row.push('floor');
    }
    cells.push(row);
  }

  // Calculate number of obstacles
  const totalCells = size * size;
  const targetObstacles = Math.floor((totalCells * obstaclePercent) / 100);

  // Create list of candidate positions (excluding start cell)
  const candidates: Coordinate[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === startPosition.x && y === startPosition.y) {
        continue;
      }
      candidates.push({ x, y });
    }
  }

  // Shuffle candidates using the seeded PRNG
  const shuffled = shuffle(prng, candidates);

  // Place obstacles one by one, ensuring we maintain or improve solvability
  let placedCount = 0;
  let unreachableBefore = findUnreachableCells(cells, startPosition, size, size);

  for (const pos of shuffled) {
    if (placedCount >= targetObstacles) break;

    // Try placing obstacle
    cells[pos.y]![pos.x] = 'obstacle';
    const unreachableAfter = findUnreachableCells(cells, startPosition, size, size);

    // Accept if:
    // 1. It doesn't make things worse (same or fewer unreachable cells)
    // 2. OR it makes fewer cells unreachable (improves solvability)
    if (unreachableAfter.length <= unreachableBefore.length) {
      placedCount++;
      unreachableBefore = unreachableAfter;

      // If we achieved full solvability, we can continue adding obstacles
      // only if they don't break it
      if (unreachableAfter.length === 0) {
        // From now on, only accept obstacles that maintain solvability
        continue;
      }
    } else {
      // This obstacle made things worse, revert
      cells[pos.y]![pos.x] = 'floor';
    }
  }

  // Final check - if not fully solvable, try adding strategic obstacles
  // to create access to unreachable areas
  let finalUnreachable = findUnreachableCells(cells, startPosition, size, size);
  let iterations = 0;
  const maxIterations = size * size; // Prevent infinite loops

  while (finalUnreachable.length > 0 && iterations < maxIterations) {
    iterations++;
    let improved = false;

    // For each unreachable cell, try placing an obstacle adjacent to it
    // This creates a stopping point that might enable access
    for (const unreachableCell of finalUnreachable) {
      const adjacentPositions = [
        { x: unreachableCell.x - 1, y: unreachableCell.y },
        { x: unreachableCell.x + 1, y: unreachableCell.y },
        { x: unreachableCell.x, y: unreachableCell.y - 1 },
        { x: unreachableCell.x, y: unreachableCell.y + 1 },
      ];

      for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= size || adj.y < 0 || adj.y >= size) continue;
        if (adj.x === startPosition.x && adj.y === startPosition.y) continue;
        if (cells[adj.y]![adj.x] !== 'floor') continue;

        // Try placing obstacle
        cells[adj.y]![adj.x] = 'obstacle';
        const newUnreachable = findUnreachableCells(cells, startPosition, size, size);

        if (newUnreachable.length < finalUnreachable.length) {
          // Improvement! Keep this obstacle
          finalUnreachable = newUnreachable;
          improved = true;
          break;
        } else {
          // No improvement, revert
          cells[adj.y]![adj.x] = 'floor';
        }
      }

      if (improved) break;
    }

    // If no improvement possible with adjacent obstacles, try converting
    // unreachable floor cells to obstacles (they can't be painted anyway)
    if (!improved && finalUnreachable.length > 0) {
      // Sort unreachable cells to make deterministic
      finalUnreachable.sort((a, b) => a.y * size + a.x - (b.y * size + b.x));

      const toConvert = finalUnreachable[0]!;
      cells[toConvert.y]![toConvert.x] = 'obstacle';
      finalUnreachable = findUnreachableCells(cells, startPosition, size, size);
    }
  }

  return cells;
}

/**
 * Generates a slide puzzle level deterministically from a seed.
 *
 * The algorithm uses constructive placement:
 * 1. Create a rectangular grid of floor cells
 * 2. Place obstacles one by one, only accepting placements that don't increase unreachable cells
 * 3. If any cells remain unreachable, convert them to obstacles or add strategic blockers
 *
 * This guarantees a solvable puzzle by construction.
 *
 * @param seed - A 64-character hex string used to seed the PRNG
 * @param size - The width and height of the grid (must be 2-100)
 * @param obstaclePercent - Target percentage of cells to be obstacles (0-100)
 * @returns A MazeState with a solvable slide puzzle
 * @throws Error if seed is invalid, size is out of bounds, or obstacle percent is invalid
 */
export function generateMaze(
  seed: Seed,
  size: number,
  obstaclePercent: number = 15
): MazeState {
  const normalizedSeed = validateAndNormalizeSeed(seed);
  validateSize(size);

  if (obstaclePercent < 0 || obstaclePercent > 100) {
    throw new Error(`Obstacle percent must be 0-100, got ${obstaclePercent}`);
  }

  // Start position is bottom-left
  const startPosition: Coordinate = { x: 0, y: size - 1 };

  // Generate the level (guaranteed solvable by construction)
  const cells = generateLevel(normalizedSeed, size, obstaclePercent, startPosition);

  // Convert to readonly
  const readonlyCells: ReadonlyArray<ReadonlyArray<CellType>> = cells.map(row =>
    row.map(cell => cell)
  );

  return {
    seed: normalizedSeed,
    width: size,
    height: size,
    cells: readonlyCells,
    startPosition,
  };
}
