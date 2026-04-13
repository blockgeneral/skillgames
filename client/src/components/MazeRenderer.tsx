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
 * Tailwind color values for SVG fill attributes.
 * Using direct hex values since SVG fill doesn't support Tailwind classes.
 */
const COLORS = {
  obstacle: '#1e293b', // slate-800
  floorUnpainted: '#e2e8f0', // slate-200
  floorPainted: '#34d399', // emerald-400
  ball: '#fbbf24', // amber-500
} as const;

/**
 * Pure SVG component that renders a maze game state.
 *
 * The renderer is intentionally dumb - it receives state and renders.
 * It does not call applyMove, does not know about the timer.
 *
 * Uses the floor/obstacle cell model:
 * - obstacle: dark cells (slate-800)
 * - floor unpainted: light cells (slate-200)
 * - floor painted: green cells (emerald-400)
 * - ball: amber circle (amber-500)
 */
export function MazeRenderer({ state, size }: MazeRendererProps): JSX.Element {
  const { maze, paintedCells, playerPosition } = state;
  const cellSize = size / maze.width;
  const cellPadding = Math.max(1, cellSize * 0.05);

  // Render all cells
  const cellRects: JSX.Element[] = [];

  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;

    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (!cellType) continue;

      const key = coordinateToKey({ x, y });
      const isPainted = paintedCells.has(key);

      let fill: string;
      if (cellType === 'obstacle' || cellType === 'void') {
        fill = COLORS.obstacle;
      } else if (isPainted) {
        fill = COLORS.floorPainted;
      } else {
        fill = COLORS.floorUnpainted;
      }

      cellRects.push(
        <rect
          key={key}
          x={x * cellSize + cellPadding}
          y={y * cellSize + cellPadding}
          width={cellSize - cellPadding * 2}
          height={cellSize - cellPadding * 2}
          rx={cellSize * 0.1}
          fill={fill}
          className="transition-colors duration-150"
        />
      );
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
      className="block"
      data-testid="maze-renderer"
    >
      {/* Background */}
      <rect x={0} y={0} width={size} height={size} fill={COLORS.obstacle} />

      {/* All cells */}
      {cellRects}

      {/* Player marker */}
      <circle
        cx={playerCx}
        cy={playerCy}
        r={playerRadius}
        fill={COLORS.ball}
        className="transition-all duration-100"
        data-testid="player-marker"
      />
    </svg>
  );
}
