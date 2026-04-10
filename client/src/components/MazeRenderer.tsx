import type { MazeGameState } from '@skillgames/shared';
import { coordinateToKey } from '@skillgames/shared';

/**
 * Props for the MazeRenderer component.
 */
export interface MazeRendererProps {
  /** The current game state to render */
  state: MazeGameState;
  /** Size in pixels (width and height are equal for square maze) */
  size: number;
}

/**
 * Pure SVG component that renders a maze game state.
 *
 * The renderer is intentionally dumb - it receives state and renders.
 * It does not call applyMove, does not know about the timer.
 * This separation allows swapping for a multiplayer renderer later.
 */
export function MazeRenderer({ state, size }: MazeRendererProps): JSX.Element {
  const { maze, paintedCells, playerPosition } = state;
  const cellSize = size / maze.width;
  const wallWidth = Math.max(1, cellSize * 0.08);
  const halfWall = wallWidth / 2;

  // Colors - Telegram-themed
  const colors = {
    background: '#181818',
    painted: '#8774e1',
    wall: '#ffffff',
    player: '#50c878',
  };

  // Build walls as a single path for better performance
  const wallPaths: string[] = [];

  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;

    for (let x = 0; x < maze.width; x++) {
      const cell = row[x];
      if (!cell) continue;

      const left = x * cellSize;
      const top = y * cellSize;
      const right = left + cellSize;
      const bottom = top + cellSize;

      // Draw walls - only draw top and left walls to avoid duplicates
      // (bottom wall of cell above is same as top wall of current cell)
      if (cell.walls.top) {
        wallPaths.push(`M${left},${top + halfWall}L${right},${top + halfWall}`);
      }
      if (cell.walls.left) {
        wallPaths.push(`M${left + halfWall},${top}L${left + halfWall},${bottom}`);
      }
      // Draw right wall only for rightmost column
      if (x === maze.width - 1 && cell.walls.right) {
        wallPaths.push(`M${right - halfWall},${top}L${right - halfWall},${bottom}`);
      }
      // Draw bottom wall only for bottom row
      if (y === maze.height - 1 && cell.walls.bottom) {
        wallPaths.push(`M${left},${bottom - halfWall}L${right},${bottom - halfWall}`);
      }
    }
  }

  // Render painted cells
  const paintedRects: JSX.Element[] = [];
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const key = coordinateToKey({ x, y });
      if (paintedCells.has(key)) {
        paintedRects.push(
          <rect
            key={key}
            x={x * cellSize}
            y={y * cellSize}
            width={cellSize}
            height={cellSize}
            fill={colors.painted}
            className="maze-cell-painted"
          />
        );
      }
    }
  }

  // Player position marker
  const playerCx = playerPosition.x * cellSize + cellSize / 2;
  const playerCy = playerPosition.y * cellSize + cellSize / 2;
  const playerRadius = cellSize * 0.3;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
      data-testid="maze-renderer"
    >
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={size}
        height={size}
        fill={colors.background}
      />

      {/* Painted cells */}
      {paintedRects}

      {/* Walls */}
      <path
        d={wallPaths.join('')}
        stroke={colors.wall}
        strokeWidth={wallWidth}
        strokeLinecap="square"
        fill="none"
      />

      {/* Player marker */}
      <circle
        cx={playerCx}
        cy={playerCy}
        r={playerRadius}
        fill={colors.player}
        data-testid="player-marker"
      />
    </svg>
  );
}
