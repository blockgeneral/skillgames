import {
  type MazeGameState,
  type Difficulty,
  type PaintMove,
  DIFFICULTY_SIZES,
  generateMaze,
  createInitialGameState,
  applyMove,
  calculateProgress,
  isPaintComplete,
} from '@skillgames/shared';
import { generateSeed } from '../lib/seed.js';

/**
 * Direction of player movement.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

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
}

/**
 * Actions for the game reducer.
 */
export type GameAction =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'TICK' }
  | { type: 'RESET'; difficulty: Difficulty };

/**
 * Creates initial game state for a given difficulty.
 */
export function createGameState(difficulty: Difficulty): GameState {
  const seed = generateSeed();
  const size = DIFFICULTY_SIZES[difficulty];
  const maze = generateMaze(seed, size);
  const mazeState = createInitialGameState(maze);

  return {
    mazeState,
    elapsedSeconds: 0,
    maxSeconds: 60,
    status: 'playing',
    difficulty,
    progress: calculateProgress(mazeState),
  };
}

/**
 * Converts a direction to dx, dy offsets.
 */
function directionToOffset(direction: Direction): { dx: number; dy: number } {
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
 * Game state reducer.
 * All game logic comes from /shared - this reducer only coordinates state transitions.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'MOVE': {
      // Don't allow moves if game is over
      if (state.status !== 'playing') {
        return state;
      }

      const { dx, dy } = directionToOffset(action.direction);
      const { playerPosition } = state.mazeState;
      const from = playerPosition;
      const to = {
        x: playerPosition.x + dx,
        y: playerPosition.y + dy,
      };

      const move: PaintMove = {
        from,
        to,
        timestamp: state.elapsedSeconds * 1000,
      };

      // Try to apply the move; if illegal, silently ignore
      let newMazeState: MazeGameState;
      try {
        newMazeState = applyMove(state.mazeState, move);
      } catch {
        // Illegal move (wall, out of bounds, etc.) - ignore
        return state;
      }

      const progress = calculateProgress(newMazeState);
      const won = isPaintComplete(newMazeState);

      return {
        ...state,
        mazeState: newMazeState,
        progress,
        status: won ? 'won' : state.status,
      };
    }

    case 'TICK': {
      // Don't tick if game is over
      if (state.status !== 'playing') {
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

    default:
      return state;
  }
}
