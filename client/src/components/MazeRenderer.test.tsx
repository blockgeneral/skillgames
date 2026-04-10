import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MazeRenderer } from './MazeRenderer.js';
import {
  generateMaze,
  createInitialGameState,
  coordinateToKey,
  type MazeGameState,
} from '@skillgames/shared';

// Clean up after each test to prevent DOM accumulation
afterEach(() => {
  cleanup();
});

/**
 * Creates a test game state with a known seed.
 */
function createTestState(size: number = 5): MazeGameState {
  const seed = 'a'.repeat(64);
  const maze = generateMaze(seed, size);
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

    it('renders with correct dimensions', () => {
      const state = createTestState();
      const size = 300;
      const { container } = render(<MazeRenderer state={state} size={size} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe(String(size));
      expect(svg?.getAttribute('height')).toBe(String(size));
    });

    it('renders player marker', () => {
      const state = createTestState();
      const { getByTestId } = render(<MazeRenderer state={state} size={300} />);
      const player = getByTestId('player-marker');
      expect(player).not.toBeNull();
      expect(player.tagName.toLowerCase()).toBe('circle');
    });

    it('renders painted cells', () => {
      const state = createTestState();
      const { container } = render(<MazeRenderer state={state} size={300} />);
      // Initial state has (0,0) painted
      const paintedCells = container.querySelectorAll('.maze-cell-painted');
      expect(paintedCells.length).toBe(1);
    });

    it('renders more painted cells as they are added', () => {
      const baseState = createTestState(5);
      // Manually add more painted cells
      const paintedCells = new Set(baseState.paintedCells);
      paintedCells.add(coordinateToKey({ x: 1, y: 0 }));
      paintedCells.add(coordinateToKey({ x: 2, y: 0 }));

      const state: MazeGameState = {
        ...baseState,
        paintedCells,
      };

      const { container } = render(<MazeRenderer state={state} size={300} />);
      const painted = container.querySelectorAll('.maze-cell-painted');
      expect(painted.length).toBe(3);
    });
  });

  describe('stability', () => {
    it('produces stable SVG output for known input state', () => {
      const state = createTestState(5);
      const size = 300;

      // Render twice and compare
      const { container: container1 } = render(<MazeRenderer state={state} size={size} />);
      const { container: container2 } = render(<MazeRenderer state={state} size={size} />);

      const svg1 = container1.querySelector('svg')?.outerHTML;
      const svg2 = container2.querySelector('svg')?.outerHTML;

      expect(svg1).toBe(svg2);
    });

    it('produces consistent output across multiple renders', () => {
      const state = createTestState(10);
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

  describe('different sizes', () => {
    it('renders 10x10 maze (easy)', () => {
      const seed = 'b'.repeat(64);
      const maze = generateMaze(seed, 10);
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={300} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders 15x15 maze (medium)', () => {
      const seed = 'c'.repeat(64);
      const maze = generateMaze(seed, 15);
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={400} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('renders 20x20 maze (hard)', () => {
      const seed = 'd'.repeat(64);
      const maze = generateMaze(seed, 20);
      const state = createInitialGameState(maze);

      const { container } = render(<MazeRenderer state={state} size={500} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });
  });

  describe('fully painted maze', () => {
    it('renders 20x20 fully painted maze without lag', () => {
      const seed = 'e'.repeat(64);
      const maze = generateMaze(seed, 20);
      const paintedCells = new Set<string>();

      // Paint all cells
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          paintedCells.add(coordinateToKey({ x, y }));
        }
      }

      const state: MazeGameState = {
        maze,
        paintedCells,
        playerPosition: { x: 19, y: 19 },
        moveCount: 400,
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
    it('positions player marker correctly at (0, 0)', () => {
      const state = createTestState(5);
      const size = 300;
      const cellSize = size / 5;
      const expectedCx = cellSize / 2;
      const expectedCy = cellSize / 2;

      const { getByTestId } = render(<MazeRenderer state={state} size={size} />);
      const player = getByTestId('player-marker');

      expect(player.getAttribute('cx')).toBe(String(expectedCx));
      expect(player.getAttribute('cy')).toBe(String(expectedCy));
    });

    it('positions player marker correctly at different position', () => {
      const baseState = createTestState(5);
      const size = 300;
      const cellSize = size / 5;

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
