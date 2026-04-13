import type { MazeGameState, Coordinate } from '@skillgames/shared';
import { coordinateToKey } from '@skillgames/shared';

/**
 * Ball slide animation duration in milliseconds.
 * Tune here — this is the single knob controlling perceived ball speed.
 */
const BALL_SLIDE_DURATION_MS = 150;

/**
 * Props for the MazeRenderer component.
 */
export interface MazeRendererProps {
  /** The current game state to render */
  state: MazeGameState;
  /** Size in pixels (width — height scales proportionally) */
  size: number;
  /** Cells from the last slide for trail effect */
  lastSlidePath?: Coordinate[];
}

/**
 * 2.5D isometric-style SVG renderer for the maze.
 *
 * Walls are raised blocks with a top face and front face.
 * Floor is a dark navy recessed plane.
 * Ball is a shaded sphere with highlight and shadow.
 * Trail dots fade out via SVG animate.
 */
export function MazeRenderer({ state, size, lastSlidePath }: MazeRendererProps): JSX.Element {
  const { maze, paintedCells, playerPosition } = state;
  const cellSize = size / maze.width;
  const WALL_H = cellSize * 0.25;
  const cellPadding = Math.max(0.5, cellSize * 0.04);
  const svgHeight = size * (maze.height / maze.width) + WALL_H;

  const floorElements: JSX.Element[] = [];
  const wallElements: JSX.Element[] = [];

  // Floor pass
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (cellType !== 'floor') continue;
      const key = coordinateToKey({ x, y });
      const isPainted = paintedCells.has(key);
      floorElements.push(
        <rect
          key={key}
          x={x * cellSize + cellPadding}
          y={y * cellSize + WALL_H + cellPadding}
          width={cellSize - cellPadding * 2}
          height={cellSize - cellPadding * 2}
          rx={2}
          fill={isPainted ? 'url(#painted-tile)' : 'url(#floor-tile)'}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.3}
          className="transition-colors duration-150"
        />
      );
    }
  }

  // Wall pass (back-to-front, top rows first).
  // Walls use zero padding and flat fills so adjacent wall cells merge into
  // one continuous cream surface with no visible inter-cell seams.
  // Vertically stacked walls: each lower wall's top face naturally occludes
  // the upper wall's front face because of render order.
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (cellType === 'floor') continue;
      const key = coordinateToKey({ x, y });

      // Front face (darker cream band below the top face)
      wallElements.push(
        <rect
          key={`${key}-side`}
          x={x * cellSize}
          y={(y + 1) * cellSize}
          width={cellSize}
          height={WALL_H}
          fill="#b8a990"
        />
      );

      // Top face (flat cream — adjacent tops share pixel-perfect edges)
      wallElements.push(
        <rect
          key={`${key}-top`}
          x={x * cellSize}
          y={y * cellSize}
          width={cellSize}
          height={cellSize}
          fill="#ece5d3"
        />
      );

      // Drop shadow on the floor cell below (if any)
      const belowCell = maze.cells[y + 1]?.[x];
      if (belowCell === 'floor') {
        wallElements.push(
          <rect
            key={`${key}-shadow`}
            x={x * cellSize}
            y={(y + 1) * cellSize + WALL_H}
            width={cellSize}
            height={3}
            fill="rgba(0,0,0,0.3)"
          />
        );
      }
    }
  }

  // Ball
  const playerCx = playerPosition.x * cellSize + cellSize / 2;
  const playerCy = playerPosition.y * cellSize + WALL_H + cellSize / 2;
  const playerRadius = cellSize * 0.32;

  // Trail
  const trailElements: JSX.Element[] = [];
  if (lastSlidePath && lastSlidePath.length > 1) {
    for (let i = 0; i < lastSlidePath.length - 1; i++) {
      const c = lastSlidePath[i]!;
      const opacity = (i + 1) / lastSlidePath.length;
      trailElements.push(
        <circle
          key={`trail-${i}`}
          cx={c.x * cellSize + cellSize / 2}
          cy={c.y * cellSize + WALL_H + cellSize / 2}
          r={cellSize * 0.2}
          fill="rgba(103, 232, 249, 0.6)"
          opacity={opacity}
        >
          <animate attributeName="opacity" from={String(opacity)} to="0" dur="0.4s" fill="freeze" />
        </circle>
      );
    }
  }

  return (
    <svg
      width={size}
      height={svgHeight}
      viewBox={`0 0 ${size} ${svgHeight}`}
      className="block"
      data-testid="maze-renderer"
    >
      <defs>
        <linearGradient id="wall-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7f3ea" />
          <stop offset="100%" stopColor="#d4ccbd" />
        </linearGradient>
        <linearGradient id="wall-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9a9282" />
          <stop offset="100%" stopColor="#6f6858" />
        </linearGradient>
        <linearGradient id="floor-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="painted-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="ball-sphere" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </radialGradient>
      </defs>

      {/* Background */}
      <rect x={0} y={0} width={size} height={svgHeight} fill="#1e293b" />

      {/* Floor cells */}
      {floorElements}

      {/* Walls (back-to-front) */}
      {wallElements}

      {/* Trail */}
      {trailElements}

      {/* Ball shadow */}
      <ellipse
        cx={playerCx}
        cy={playerCy + playerRadius + cellSize * 0.08}
        rx={playerRadius * 0.7}
        ry={playerRadius * 0.25}
        fill="rgba(0,0,0,0.3)"
      />

      {/* Ball sphere */}
      <circle
        cx={playerCx}
        cy={playerCy}
        r={playerRadius}
        fill="url(#ball-sphere)"
        style={{
          transitionProperty: 'cx, cy',
          transitionDuration: `${BALL_SLIDE_DURATION_MS}ms`,
          transitionTimingFunction: 'linear',
        }}
        data-testid="player-marker"
      />

      {/* Ball highlight */}
      <ellipse
        cx={playerCx - playerRadius * 0.2}
        cy={playerCy - playerRadius * 0.2}
        rx={playerRadius * 0.28}
        ry={playerRadius * 0.22}
        fill="rgba(255,255,255,0.65)"
      />
    </svg>
  );
}
