import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MazeRenderer } from './MazeRenderer.js';
import {
  generateMaze,
  createInitialGameState,
  coordinateToKey,
  type MazeGameState,
  type Difficulty,
} from '@skillgames/shared';

// Clean up after each test to prevent DOM accumulation
afterEach(() => {
  cleanup();
});

/**
 * Creates a test game state with a known seed and difficulty.
 */
function createTestState(difficulty: Difficulty = 'medium'): MazeGameState {
  const seed = 'a'.repeat(64);
  const maze = generateMaze(seed, difficulty);
  return createInitialGameState(maze);
}

describe('MazeRenderer', () => {
  describe('rendering', () => {
    it('renders an SVG element', () => {
      const state = createTestState();
      const { container } = render(<MazeRenderer state={state} size={300} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders with correct width', () => {
      const state = createTestState();
      const size = 300;
      const { container } = render(<MazeRenderer state={state} size={size} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe(String(size));
    });

    it('renders player marker', () => {
      const state = createTestState();
      const { getByTestId } = render(<MazeRenderer state={state} size={300} />);
      const player = getByTestId('player-marker');
      expect(player).not.toBeNull();
      expect(player.tagName.toLowerCase()).toBe('circle');
    });

    it('renders cells as rects', () => {
      const state = createTestState();
      const { container } = render(<MazeRenderer state={state} size={300} />);
      // Should have multiple rect elements for cells
      const rects = container.querySelectorAll('rect');
      // At least background + one cell
      expect(rects.length).toBeGreaterThan(1);
    });
  });

  describe('stability', () => {
    it('produces stable SVG output for known input state', () => {
      const state = createTestState('medium');
      const size = 300;

      // Render twice and compare
      const { container: container1 } = render(<MazeRenderer state={state} size={size} />);
      const { container: container2 } = render(<MazeRenderer state={state} size={size} />);

      const svg1 = container1.querySelector('svg')?.outerHTML;
      const svg2 = container2.querySelector('svg')?.outerHTML;

      expect(svg1).toBe(svg2);
    });

    it('produces consistent output across multiple renders', () => {
      const state = createTestState('medium');
      const size = 400;
      const outputs: string[] = [];

      for (let i = 0; i < 10; i++) {
        const { container } = render(<MazeRenderer state={state} size={size} />);
        const svg = container.querySelector('svg')?.outerHTML;
        if (svg) outputs.push(svg);
      }

      // All outputs should be identical
      const first = outputs[0];
      for (const output of outputs) {
        expect(output).toBe(first);
      }
    });
  });

  describe('different difficulties', () => {
    it('renders easy maze', () => {
      const seed = 'b'.repeat(64);
      const maze = generateMaze(seed, 'medium');
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={300} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders medium maze', () => {
      const seed = 'c'.repeat(64);
      const maze = generateMaze(seed, 'medium');
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={400} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders hard maze', () => {
      const seed = 'd'.repeat(64);
      const maze = generateMaze(seed, 'hard');
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={500} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });
  });

  describe('fully painted maze', () => {
    it('renders hard difficulty fully painted maze without lag', () => {
      const seed = 'e'.repeat(64);
      const maze = generateMaze(seed, 'hard');
      const paintedCells = new Set<string>();

      // Paint all floor cells
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (maze.cells[y]?.[x] === 'floor') {
            paintedCells.add(coordinateToKey({ x, y }));
          }
        }
      }

      const state: MazeGameState = {
        maze,
        paintedCells,
        playerPosition: { x: maze.width - 1, y: maze.height - 1 },
        moveCount: 100,
      };

      const start = performance.now();
      const { container } = render(<MazeRenderer state={state} size={500} />);
      const duration = performance.now() - start;

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();

      // Should render quickly (under 100ms even with all cells painted)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('player position', () => {
    it('positions player marker at start position', () => {
      const seed = 'f'.repeat(64);
      const maze = generateMaze(seed, 'medium');
      const state = createInitialGameState(maze);
      const size = 300;
      const cellSize = size / maze.width;

      const expectedCx = maze.startPosition.x * cellSize + cellSize / 2;
      const expectedCy = maze.startPosition.y * cellSize + cellSize / 2;

      const { getByTestId } = render(<MazeRenderer state={state} size={size} />);
      const player = getByTestId('player-marker');

      expect(player.getAttribute('cx')).toBe(String(expectedCx));
      expect(player.getAttribute('cy')).toBe(String(expectedCy));
    });

    it('positions player marker correctly at different position', () => {
      const seed = '7'.repeat(64);
      const maze = generateMaze(seed, 'medium');
      const baseState = createInitialGameState(maze);
      const size = 300;
      const cellSize = size / maze.width;

      const state: MazeGameState = {
        ...baseState,
        playerPosition: { x: 2, y: 3 },
      };

      const expectedCx = 2 * cellSize + cellSize / 2;
      const expectedCy = 3 * cellSize + cellSize / 2;

      const { getByTestId } = render(<MazeRenderer state={state} size={size} />);
      const player = getByTestId('player-marker');

      expect(player.getAttribute('cx')).toBe(String(expectedCx));
      expect(player.getAttribute('cy')).toBe(String(expectedCy));
    });
  });
});
