import {
  type MazeGameState,
  type MazeState,
  type Difficulty,
  type Direction,
  type Coordinate,
  type PaintMove,
  type Seed,
  generateMaze,
  createInitialGameState,
  applyMove,
  simulateSlide,
  calculateProgress,
  isPaintComplete,
  coordinateToKey,
} from '@skillgames/shared';
import { generateSeed } from '../lib/seed.js';

export type { Direction };

/**
 * Status of the current game.
 */
export type GameStatus = 'playing' | 'won' | 'timeout';

/**
 * The full game state including timer and status.
 */
export interface GameState {
  /** The maze game state from /shared */
  readonly mazeState: MazeGameState;
  /** The seed used to generate this maze */
  readonly seed: Seed;
  /** Elapsed time in seconds */
  readonly elapsedSeconds: number;
  /** Maximum time allowed in seconds */
  readonly maxSeconds: number;
  /** Current game status */
  readonly status: GameStatus;
  /** Current difficulty */
  readonly difficulty: Difficulty;
  /** Calculated progress percentage */
  readonly progress: number;
  /** Whether game is paused */
  readonly paused: boolean;
  /** Cells traversed during the last slide (for trail rendering) */
  readonly lastSlidePath: Coordinate[];
  /**
   * Subset of lastSlidePath that were NOT already painted before this slide.
   * Renderer uses this to mask paint-follows-ball — cells the ball retraverses
   * stay painted rather than flashing back to unpainted.
   */
  readonly lastSlideFreshCells: ReadonlyArray<Coordinate>;
  /**
   * Timestamp (performance.now()-style ms) of the last applied move. Renderer
   * uses this to trigger its animation loop. A distinct identity per move
   * even when path is unchanged.
   */
  readonly lastSlideAt: number;
}

/**
 * Actions for the game reducer.
 */
export type GameAction =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'TICK' }
  | { type: 'RESET'; difficulty: Difficulty }
  | { type: 'RESET_SAME_MAZE' }
  | { type: 'TOGGLE_PAUSE' };

/**
 * Creates a game state from a given maze.
 */
function createGameStateFromMaze(
  maze: MazeState,
  seed: Seed,
  difficulty: Difficulty
): GameState {
  const mazeState = createInitialGameState(maze);

  return {
    mazeState,
    seed,
    elapsedSeconds: 0,
    maxSeconds: 60,
    status: 'playing',
    difficulty,
    progress: calculateProgress(mazeState),
    paused: false,
    lastSlidePath: [],
    lastSlideFreshCells: [],
    lastSlideAt: 0,
  };
}

/**
 * Creates initial game state for a given difficulty.
 */
export function createGameState(difficulty: Difficulty): GameState {
  const seed = generateSeed();
  const maze = generateMaze(seed, difficulty);
  return createGameStateFromMaze(maze, seed, difficulty);
}

/**
 * Game state reducer.
 * All game logic comes from /shared - this reducer only coordinates state transitions.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'MOVE': {
      // Don't allow moves if game is over or paused
      if (state.status !== 'playing' || state.paused) {
        return state;
      }

      const move: PaintMove = {
        direction: action.direction,
        timestamp: state.elapsedSeconds * 1000,
      };

      // Capture the set of cells that were painted BEFORE this move so we can
      // diff after.
      const beforePainted = state.mazeState.paintedCells;

      // Apply the move; if ball can't move in that direction, returns unchanged state
      const newMazeState = applyMove(state.mazeState, move);

      // If state didn't change, return as-is
      if (newMazeState === state.mazeState) {
        return state;
      }

      // Compute slide path for trail rendering
      const { path } = simulateSlide(
        state.mazeState.maze.cells,
        state.mazeState.playerPosition.x,
        state.mazeState.playerPosition.y,
        action.direction,
        state.mazeState.maze.width,
        state.mazeState.maze.height,
      );

      // Diff: cells along the slide path that were NOT already painted
      const freshCells: Coordinate[] = [];
      for (const c of path) {
        if (!beforePainted.has(coordinateToKey(c))) {
          freshCells.push(c);
        }
      }

      const progress = calculateProgress(newMazeState);
      const won = isPaintComplete(newMazeState);

      // On win, truncate the visual slide path to end at the last freshly
      // painted cell — the cell whose painting triggers 100%.
      let visualPath = path;
      if (won && freshCells.length > 0) {
        const lastFresh = freshCells[freshCells.length - 1]!;
        const lastFreshKey = coordinateToKey(lastFresh);
        for (let i = path.length - 1; i >= 0; i--) {
          if (coordinateToKey(path[i]!) === lastFreshKey) {
            visualPath = path.slice(0, i + 1);
            break;
          }
        }
      }

      return {
        ...state,
        mazeState: newMazeState,
        progress,
        status: won ? 'won' : state.status,
        lastSlidePath: visualPath,
        lastSlideFreshCells: freshCells,
        lastSlideAt: Date.now(),
      };
    }

    case 'TICK': {
      // Don't tick if game is over or paused
      if (state.status !== 'playing' || state.paused) {
        return state;
      }

      const newElapsed = state.elapsedSeconds + 1;
      const timeout = newElapsed >= state.maxSeconds;

      return {
        ...state,
        elapsedSeconds: newElapsed,
        status: timeout ? 'timeout' : state.status,
      };
    }

    case 'RESET': {
      return createGameState(action.difficulty);
    }

    case 'RESET_SAME_MAZE': {
      // Regenerate the same maze from the same seed
      const maze = generateMaze(state.seed, state.difficulty);
      return createGameStateFromMaze(maze, state.seed, state.difficulty);
    }

    case 'TOGGLE_PAUSE': {
      // Only allow pause while playing
      if (state.status !== 'playing') {
        return state;
      }
      return {
        ...state,
        paused: !state.paused,
      };
    }

    default:
      return state;
  }
}
