import { useEffect, useRef, useState } from 'react';
import type { MazeGameState, Coordinate, NeonPalette } from '@skillgames/shared';
import { coordinateToKey, getPaletteForSeed } from '@skillgames/shared';
import type { BallEffectId, BackgroundEffectId, BallSample, CellDrop } from './effects/types.js';
import { renderBallEffect } from './effects/ballEffects.js';
import { renderBackgroundEffect } from './effects/backgroundEffects.js';

/**
 * Per-cell ball travel time during a slide. Total slide duration scales with
 * path length. Faster than before to match input rate.
 */
const MS_PER_CELL = 40;

/**
 * How long ball samples stay in history for trail-anchored effects. Must be
 * long enough that rocket/streak/plasma look continuous, short enough that
 * ghost echoes don't lag indefinitely once the ball stops.
 */
const HISTORY_WINDOW_MS = 450;

/**
 * Max samples kept in history, as a safety cap on memory.
 */
const HISTORY_MAX_SAMPLES = 40;

/**
 * Max age of cell "drops" (for scorched/particles/ink/rings). Drops older
 * than this are evicted.
 */
const DROP_WINDOW_MS = 800;

/**
 * 3D perspective tilt angle in degrees. Rotates the maze around its top edge
 * so the bottom appears closer to the viewer (slot-machine / pinball feel).
 * 0 = flat. Higher values = more tilt. 8° is conservative; 12-15° is more
 * dramatic. Above ~22° starts to compress the top of the board noticeably.
 */
const TILT_DEGREES = 12;

/**
 * Perspective distance for the tilt. Smaller = stronger 3D effect (more
 * dramatic foreshortening). Larger = subtler. 1200px pairs well with 8°.
 */
const TILT_PERSPECTIVE_PX = 1200;

export interface MazeRendererProps {
  state: MazeGameState;
  size: number;
  lastSlidePath?: Coordinate[];
  /**
   * Subset of lastSlidePath that was freshly painted by this slide. Renderer
   * masks only these cells as unpainted-until-reached so the ball doesn't
   * appear to "re-paint" cells it's retraversing.
   */
  lastSlideFreshCells?: ReadonlyArray<Coordinate>;
  /** Timestamp (Date.now() scale) of the last applied move — changes identity per move. */
  lastSlideAt?: number;
  ballEffect?: BallEffectId;
  backgroundEffect?: BackgroundEffectId;
}

interface SlideFrame {
  ballPos: { x: number; y: number };
  cellsReached: number;
  /** Set of "x,y" keys for path cells the ball has NOT yet reached. */
  pathAheadKeys: Set<string>;
}

function computeSlideFrame(
  path: Coordinate[] | undefined,
  slideStart: number | null,
  now: number
): SlideFrame | null {
  if (!path || path.length < 2 || slideStart === null) return null;
  const elapsed = now - slideStart;
  const totalSlideMs = (path.length - 1) * MS_PER_CELL;
  if (elapsed >= totalSlideMs) return null;

  const exactCellPos = Math.min(path.length - 1, elapsed / MS_PER_CELL);
  const cellsReached = Math.floor(exactCellPos);
  const subProgress = exactCellPos - cellsReached;

  const fromCell = path[cellsReached]!;
  const toCell = path[Math.min(cellsReached + 1, path.length - 1)]!;
  const ballPos = {
    x: fromCell.x + (toCell.x - fromCell.x) * subProgress,
    y: fromCell.y + (toCell.y - fromCell.y) * subProgress,
  };

  const pathAheadKeys = new Set<string>();
  for (let i = cellsReached + 1; i < path.length; i++) {
    pathAheadKeys.add(coordinateToKey(path[i]!));
  }
  return { ballPos, cellsReached, pathAheadKeys };
}

/**
 * 2.5D SVG renderer for Maze Paint with pluggable ball + background effects.
 */
export function MazeRenderer({
  state,
  size,
  lastSlidePath,
  lastSlideFreshCells,
  lastSlideAt,
  ballEffect = 'none',
  backgroundEffect = 'none',
}: MazeRendererProps): JSX.Element {
  const { maze, paintedCells, playerPosition } = state;
  const cellSize = size / maze.width;
  const WALL_H = cellSize * 0.25;
  const cellPadding = Math.max(0.5, cellSize * 0.04);
  const svgHeight = size * (maze.height / maze.width);

  const palette: NeonPalette = getPaletteForSeed(maze.seed);

  // Slide animation state
  const slideStartRef = useRef<number | null>(null);
  const lastSlideAtRef = useRef<number | undefined>(undefined);
  const historyRef = useRef<BallSample[]>([]);
  const dropsRef = useRef<CellDrop[]>([]);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceFrameTick] = useState(0);

  // Determine whether an effect requires continuous rAF (drops fading, or
  // effect animates independently of ball motion).
  const needsContinuousRaf =
    ballEffect !== 'none' || backgroundEffect !== 'none';

  // Start a new slide when lastSlideAt changes — initialized DURING render so
  // the first paint already shows the ball at path[0], not at the destination.
  // Without this synchronous init, React would render the new ball position
  // before the post-paint effect could anchor the slide animation, causing a
  // one-frame "flash" at the destination cell.
  if (
    lastSlidePath &&
    lastSlidePath.length >= 2 &&
    lastSlideAt !== lastSlideAtRef.current
  ) {
    lastSlideAtRef.current = lastSlideAt;
    slideStartRef.current = performance.now();
    lastCellRef.current = null;
  }

  // Main animation loop. Runs whenever any slide or effect is active.
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const loop = (): void => {
      if (cancelled) return;
      const now = performance.now();

      // Sample ball position into history + compute current ball position
      const frame = computeSlideFrame(lastSlidePath, slideStartRef.current, now);
      let cx: number;
      let cy: number;
      if (frame) {
        cx = frame.ballPos.x * cellSize + cellSize / 2;
        cy = frame.ballPos.y * cellSize + cellSize / 2;
      } else {
        cx = playerPosition.x * cellSize + cellSize / 2;
        cy = playerPosition.y * cellSize + cellSize / 2;
        if (slideStartRef.current !== null) {
          // Slide just ended — clear slide but let drops/history decay naturally
          slideStartRef.current = null;
        }
      }

      historyRef.current.push({ cx, cy, t: now });
      while (historyRef.current.length > 0 && now - historyRef.current[0]!.t > HISTORY_WINDOW_MS) {
        historyRef.current.shift();
      }
      while (historyRef.current.length > HISTORY_MAX_SAMPLES) historyRef.current.shift();

      // Record cell-exit drops when ball crosses into a new cell during a slide
      if (frame && lastSlidePath) {
        const currentCell = lastSlidePath[frame.cellsReached]!;
        const last = lastCellRef.current;
        if (!last || last.x !== currentCell.x || last.y !== currentCell.y) {
          dropsRef.current.push({ coord: currentCell, arrivedAt: now });
          lastCellRef.current = { x: currentCell.x, y: currentCell.y };
        }
      }
      // Evict expired drops
      while (dropsRef.current.length > 0 && now - dropsRef.current[0]!.arrivedAt > DROP_WINDOW_MS) {
        dropsRef.current.shift();
      }

      forceFrameTick((t) => (t + 1) % 1_000_000);

      // Continue the loop if: slide is active, drops are still fading, or a
      // continuous-animation effect is selected that needs frame updates.
      const hasLiveDrops = dropsRef.current.length > 0;
      const slideActive = frame !== null;
      const shouldContinue =
        slideActive || hasLiveDrops || needsContinuousRaf;

      if (shouldContinue) {
        raf = requestAnimationFrame(loop);
      }
    };

    // Always kick the loop; it self-terminates via shouldContinue.
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [
    lastSlideAt,
    lastSlidePath,
    playerPosition.x,
    playerPosition.y,
    cellSize,
    WALL_H,
    needsContinuousRaf,
    backgroundEffect,
    ballEffect,
  ]);

  const now = performance.now();
  const frame = computeSlideFrame(lastSlidePath, slideStartRef.current, now);
  const ballX = frame ? frame.ballPos.x : playerPosition.x;
  const ballY = frame ? frame.ballPos.y : playerPosition.y;
  const ballCx = ballX * cellSize + cellSize / 2;
  const ballCy = ballY * cellSize + cellSize / 2;
  const playerRadius = cellSize * 0.32;

  // Only FRESHLY painted cells in this slide should be masked until reached.
  // Retraversed cells stay painted.
  const freshKeys = new Set<string>();
  if (lastSlideFreshCells) {
    for (const c of lastSlideFreshCells) freshKeys.add(coordinateToKey(c));
  }
  const maskedKeys = new Set<string>();
  if (frame) {
    for (const k of frame.pathAheadKeys) {
      if (freshKeys.has(k)) maskedKeys.add(k);
    }
  }

  // Background effect — contributes the bg-pattern <defs>; walls always use
  // DEFAULT_WALL_THEME (solid dark slate). The pattern is painted as a single
  // low-opacity overlay rect masked to wall cells (see overlay layer below).
  const bgResult = renderBackgroundEffect({ effect: backgroundEffect, now });
  const hasBgOverlay = backgroundEffect !== 'none';

  // Ball effect
  const ballResult = renderBallEffect({
    effect: ballEffect,
    ballCx,
    ballCy,
    history: historyRef.current,
    drops: dropsRef.current,
    cellSize,
    wallH: WALL_H,
    palette,
    now,
  });

  // Render passes
  const floorElements: JSX.Element[] = [];
  const wallElements: JSX.Element[] = [];
  // White rects defining the wall region for the overlay mask.
  const wallMaskRects: JSX.Element[] = [];

  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (cellType !== 'floor') continue;
      const key = coordinateToKey({ x, y });
      const isPainted = paintedCells.has(key) && !maskedKeys.has(key);
      floorElements.push(
        <rect
          key={key}
          x={x * cellSize + cellPadding}
          y={y * cellSize + cellPadding}
          width={cellSize - cellPadding * 2}
          height={cellSize - cellPadding * 2}
          rx={2}
          fill={isPainted ? `url(#painted-tile-${palette.name})` : 'url(#floor-tile)'}
          stroke={isPainted ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)'}
          strokeWidth={isPainted ? 0.3 : 1}
          data-cell-key={key}
          data-painted={isPainted ? 'true' : 'false'}
        />
      );
    }
  }

  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      const cellType = row[x];
      if (cellType === 'floor') continue;
      const key = coordinateToKey({ x, y });

      wallElements.push(
        <rect
          key={`${key}-wall`}
          x={x * cellSize}
          y={y * cellSize}
          width={cellSize}
          height={cellSize}
          fill="#1e293b"
        />
      );
      // Mask rect: matches the new unified wall geometry so the overlay tints
      // exactly the wall silhouette.
      if (hasBgOverlay) {
        wallMaskRects.push(
          <rect
            key={`${key}-mask`}
            x={x * cellSize}
            y={y * cellSize}
            width={cellSize}
            height={cellSize}
            fill="white"
          />
        );
      }
    }
  }

  // Bevel highlights and shadows on wall-to-floor boundaries.
  // Light lines on top/left edges facing floor; dark lines on bottom/right.
  const bevelElements: JSX.Element[] = [];
  const BEVEL_W = Math.max(1, cellSize * 0.04);
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      if (row[x] === 'floor') continue;
      const key = coordinateToKey({ x, y });
      const x0 = x * cellSize;
      const y0 = y * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;
      // Top edge: light if cell above is not a wall
      if (maze.cells[y - 1]?.[x] === 'floor' || y === 0) {
        bevelElements.push(<line key={`${key}-bt`} x1={x0} y1={y0} x2={x1} y2={y0} stroke="rgba(255,255,255,0.12)" strokeWidth={BEVEL_W} />);
      }
      // Left edge: light if cell to left is not a wall
      if (maze.cells[y]?.[x - 1] === 'floor' || x === 0) {
        bevelElements.push(<line key={`${key}-bl`} x1={x0} y1={y0} x2={x0} y2={y1} stroke="rgba(255,255,255,0.12)" strokeWidth={BEVEL_W} />);
      }
      // Bottom edge: dark if cell below is not a wall
      if (maze.cells[y + 1]?.[x] === 'floor' || y === maze.height - 1) {
        bevelElements.push(<line key={`${key}-bb`} x1={x0} y1={y1} x2={x1} y2={y1} stroke="rgba(0,0,0,0.25)" strokeWidth={BEVEL_W} />);
      }
      // Right edge: dark if cell to right is not a wall
      if (maze.cells[y]?.[x + 1] === 'floor' || x === maze.width - 1) {
        bevelElements.push(<line key={`${key}-br`} x1={x1} y1={y0} x2={x1} y2={y1} stroke="rgba(0,0,0,0.25)" strokeWidth={BEVEL_W} />);
      }
    }
  }

  return (
    <svg
      width={size}
      height={svgHeight}
      viewBox={`0 0 ${size} ${svgHeight}`}
      className="block"
      data-testid="maze-renderer"
      style={{
        transform: `perspective(${TILT_PERSPECTIVE_PX}px) rotateX(${TILT_DEGREES}deg)`,
        transformOrigin: 'center top',
      }}
    >
      <defs>
        <linearGradient id="floor-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#475569" />
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
        <filter id="ball-shadow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={cellSize * 0.06} />
        </filter>
        {bgResult.defs}
        {ballResult.defs}
        {hasBgOverlay && (
          <mask id="wall-overlay-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={svgHeight}>
            <rect x={0} y={0} width={size} height={svgHeight} fill="black" />
            {wallMaskRects}
          </mask>
        )}
      </defs>

      {/* 1. Wall flat fills (back) */}
      {wallElements}

      {/* 2. Wall pattern overlay — painted only over wall silhouettes */}
      {hasBgOverlay && (
        <rect
          x={0}
          y={0}
          width={size}
          height={svgHeight}
          fill="url(#bg-pattern)"
          opacity={0.7}
          mask="url(#wall-overlay-mask)"
        />
      )}

      {/* 3. Wall bevels — after overlay so they're visible on top of texture */}
      {bevelElements}

      {/* 4. Floor cells */}
      {floorElements}

      {/* 4. Ball effect (between floors and ball) */}
      {ballResult.nodes}

      {/* Ball shadow */}
      <ellipse
        cx={ballCx}
        cy={ballCy + playerRadius * 0.7}
        rx={playerRadius * 0.55}
        ry={playerRadius * 0.18}
        fill="rgba(0,0,0,0.35)"
        filter="url(#ball-shadow-blur)"
      />

      {/* Ball sphere */}
      <circle
        cx={ballCx}
        cy={ballCy}
        r={playerRadius}
        fill="url(#ball-sphere)"
        data-testid="player-marker"
      />

      {/* Ball highlight */}
      <ellipse
        cx={ballCx - playerRadius * 0.2}
        cy={ballCy - playerRadius * 0.2}
        rx={playerRadius * 0.28}
        ry={playerRadius * 0.22}
        fill="rgba(255,255,255,0.65)"
      />
    </svg>
  );
}
