import { useEffect, useRef, useState } from 'react';
import type { MazeGameState, Coordinate, NeonPalette } from '@skillgames/shared';
import { coordinateToKey, getPaletteForSeed } from '@skillgames/shared';

/**
 * Per-cell ball travel time during a slide. Total slide duration scales with
 * path length, so the ball moves at a constant per-cell speed regardless of
 * how far it slides. Tune here.
 */
const MS_PER_CELL = 80;

/**
 * Trail glow lifetime per cell, measured from when the ball first arrives at
 * that cell. Trail dots fade linearly from full opacity to zero over this
 * window. Total animation time = (path.length - 1) * MS_PER_CELL + TRAIL_FADE_MS.
 */
const TRAIL_FADE_MS = 800;

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

interface SlideFrame {
  ballPos: { x: number; y: number };
  cellsReached: number;
  pathAhead: Set<string>;
  trail: ReadonlyArray<{ key: string; coord: Coordinate; opacity: number }>;
}

/**
 * Computes the visual state for the in-progress slide animation.
 * Returns null if no slide is active or the animation has fully completed
 * (trail also fully decayed).
 */
function computeSlideFrame(
  path: Coordinate[] | undefined,
  slideStart: number | null,
  now: number
): SlideFrame | null {
  if (!path || path.length < 2 || slideStart === null) return null;

  const elapsed = now - slideStart;
  const totalSlideMs = (path.length - 1) * MS_PER_CELL;
  const totalAnimMs = totalSlideMs + TRAIL_FADE_MS;
  if (elapsed >= totalAnimMs) return null;

  const exactCellPos = Math.min(path.length - 1, elapsed / MS_PER_CELL);
  const cellsReached = Math.floor(exactCellPos);
  const subProgress = exactCellPos - cellsReached;

  const fromCell = path[cellsReached]!;
  const toCell = path[Math.min(cellsReached + 1, path.length - 1)]!;
  const ballPos = {
    x: fromCell.x + (toCell.x - fromCell.x) * subProgress,
    y: fromCell.y + (toCell.y - fromCell.y) * subProgress,
  };

  const pathAhead = new Set<string>();
  for (let i = cellsReached + 1; i < path.length; i++) {
    pathAhead.add(coordinateToKey(path[i]!));
  }

  const trail: Array<{ key: string; coord: Coordinate; opacity: number }> = [];
  for (let i = 0; i <= cellsReached; i++) {
    const cell = path[i]!;
    const timeReached = i * MS_PER_CELL;
    const ageMs = elapsed - timeReached;
    const opacity = Math.max(0, 1 - ageMs / TRAIL_FADE_MS);
    if (opacity > 0) {
      trail.push({ key: `t-${i}`, coord: cell, opacity });
    }
  }

  return { ballPos, cellsReached, pathAhead, trail };
}

/**
 * 2.5D SVG renderer for Maze Paint.
 *
 * Animation model: the reducer applies slide moves instantly, but the renderer
 * interpolates the ball position frame-by-frame and masks not-yet-reached
 * cells in the active slide path so that paint visually follows the ball.
 *
 * Per-match palette is derived from the maze seed so both opponents see the
 * same colors.
 */
export function MazeRenderer({ state, size, lastSlidePath }: MazeRendererProps): JSX.Element {
  const { maze, paintedCells, playerPosition } = state;
  const cellSize = size / maze.width;
  const WALL_H = cellSize * 0.25;
  const cellPadding = Math.max(0.5, cellSize * 0.04);
  const svgHeight = size * (maze.height / maze.width) + WALL_H;

  const palette: NeonPalette = getPaletteForSeed(maze.seed);

  // Animation state: slideStart is set when a new lastSlidePath arrives.
  // The forceFrameTick state forces a re-render on each rAF tick during animation.
  const slideStartRef = useRef<number | null>(null);
  const lastPathRef = useRef<Coordinate[] | undefined>(undefined);
  const [, forceFrameTick] = useState(0);

  // When a new slide path arrives, mark the start time and run the rAF loop
  // for the duration of the slide + trail fade.
  useEffect(() => {
    if (!lastSlidePath || lastSlidePath.length < 2) return;
    if (lastSlidePath === lastPathRef.current) return;
    lastPathRef.current = lastSlidePath;
    slideStartRef.current = performance.now();

    const totalAnimMs = (lastSlidePath.length - 1) * MS_PER_CELL + TRAIL_FADE_MS;
    let raf = 0;
    const loop = (): void => {
      const elapsed = performance.now() - slideStartRef.current!;
      forceFrameTick((t) => (t + 1) % 1_000_000);
      if (elapsed < totalAnimMs) {
        raf = requestAnimationFrame(loop);
      } else {
        slideStartRef.current = null;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [lastSlidePath]);

  const frame = computeSlideFrame(lastSlidePath, slideStartRef.current, performance.now());

  // Resolve final ball position and which cells should look painted right now.
  const ballX = frame ? frame.ballPos.x : playerPosition.x;
  const ballY = frame ? frame.ballPos.y : playerPosition.y;
  const pathAhead = frame ? frame.pathAhead : null;

  // Render passes
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
      // A cell is visually painted iff it's in the canonical painted set AND
      // the ball has either already passed it or it's not part of the
      // currently-animating slide path.
      const isPainted = paintedCells.has(key) && !(pathAhead && pathAhead.has(key));
      floorElements.push(
        <rect
          key={key}
          x={x * cellSize + cellPadding}
          y={y * cellSize + WALL_H + cellPadding}
          width={cellSize - cellPadding * 2}
          height={cellSize - cellPadding * 2}
          rx={2}
          fill={isPainted ? `url(#painted-tile-${palette.name})` : 'url(#floor-tile)'}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.3}
          data-cell-key={key}
          data-painted={isPainted ? 'true' : 'false'}
        />
      );
    }
  }

  // Wall pass — flat fills, zero padding so adjacent walls merge into a
  // continuous cream surface.
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (cellType === 'floor') continue;
      const key = coordinateToKey({ x, y });

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

  // Trail glow elements — rendered above floor, below the ball.
  // Drawn as soft circles in the palette's trail color, each fading on its own clock.
  const trailElements: JSX.Element[] = [];
  if (frame) {
    for (const t of frame.trail) {
      const cx = t.coord.x * cellSize + cellSize / 2;
      const cy = t.coord.y * cellSize + WALL_H + cellSize / 2;
      trailElements.push(
        <circle
          key={t.key}
          cx={cx}
          cy={cy}
          r={cellSize * 0.42}
          fill={palette.trail}
          opacity={t.opacity * 0.65}
          filter="url(#trail-blur)"
        />
      );
    }
  }

  // Ball geometry
  const playerCx = ballX * cellSize + cellSize / 2;
  const playerCy = ballY * cellSize + WALL_H + cellSize / 2;
  const playerRadius = cellSize * 0.32;

  return (
    <svg
      width={size}
      height={svgHeight}
      viewBox={`0 0 ${size} ${svgHeight}`}
      className="block"
      data-testid="maze-renderer"
    >
      <defs>
        <linearGradient id="floor-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id={`painted-tile-${palette.name}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.paint1} />
          <stop offset="100%" stopColor={palette.paint2} />
        </linearGradient>
        <radialGradient id="ball-sphere" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </radialGradient>
        <filter id="trail-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={cellSize * 0.08} />
        </filter>
        <filter id="ball-shadow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={cellSize * 0.06} />
        </filter>
      </defs>

      {/* Background */}
      <rect x={0} y={0} width={size} height={svgHeight} fill="#1e293b" />

      {/* Floor cells */}
      {floorElements}

      {/* Walls */}
      {wallElements}

      {/* Trail (above floor, below ball) */}
      {trailElements}

      {/* Ball shadow — soft, low-opacity, kept tight to the ball */}
      <ellipse
        cx={playerCx}
        cy={playerCy + playerRadius * 0.7}
        rx={playerRadius * 0.55}
        ry={playerRadius * 0.18}
        fill="rgba(0,0,0,0.35)"
        filter="url(#ball-shadow-blur)"
      />

      {/* Ball sphere — no CSS transition; position is updated per frame */}
      <circle
        cx={playerCx}
        cy={playerCy}
        r={playerRadius}
        fill="url(#ball-sphere)"
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
