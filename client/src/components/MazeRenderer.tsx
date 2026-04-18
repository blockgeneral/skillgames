import { useEffect, useRef, useState } from 'react';
import type { MazeGameState, Coordinate, NeonPalette } from '@skillgames/shared';
import { coordinateToKey, getPaletteForSeed } from '@skillgames/shared';
import type { BallEffectId, BackgroundEffectId, BallSample, CellDrop } from './effects/types.js';
import { renderBallEffect } from './effects/ballEffects.js';
import { renderBackgroundEffect } from './effects/backgroundEffects.js';

const MS_PER_CELL = 32;
const HISTORY_WINDOW_MS = 450;
const HISTORY_MAX_SAMPLES = 40;
const DROP_WINDOW_MS = 800;
const TILT_DEGREES = 12;
const TILT_PERSPECTIVE_PX = 1200;

export interface MazeRendererProps {
  state: MazeGameState;
  size: number;
  lastSlidePath?: Coordinate[];
  lastSlideFreshCells?: ReadonlyArray<Coordinate>;
  lastSlideAt?: number;
  ballEffect?: BallEffectId;
  backgroundEffect?: BackgroundEffectId;
}

interface SlideFrame {
  ballPos: { x: number; y: number };
  cellsReached: number;
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
  const svgHeight = size * (maze.height / maze.width);
  const pad = 0.5;

  const palette: NeonPalette = getPaletteForSeed(maze.seed);

  // Slide animation state
  const slideStartRef = useRef<number | null>(null);
  const lastSlideAtRef = useRef<number | undefined>(undefined);
  const historyRef = useRef<BallSample[]>([]);
  const dropsRef = useRef<CellDrop[]>([]);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceFrameTick] = useState(0);

  const needsContinuousRaf =
    ballEffect !== 'none' || backgroundEffect !== 'none';

  // Synchronous slide init (prevents destination flash)
  if (
    lastSlidePath &&
    lastSlidePath.length >= 2 &&
    lastSlideAt !== lastSlideAtRef.current
  ) {
    lastSlideAtRef.current = lastSlideAt;
    slideStartRef.current = performance.now();
    lastCellRef.current = null;
  }

  // rAF loop
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const loop = (): void => {
      if (cancelled) return;
      const now = performance.now();
      const frame = computeSlideFrame(lastSlidePath, slideStartRef.current, now);
      let cx: number;
      let cy: number;
      if (frame) {
        cx = frame.ballPos.x * cellSize + cellSize / 2;
        cy = frame.ballPos.y * cellSize + cellSize / 2;
      } else {
        cx = playerPosition.x * cellSize + cellSize / 2;
        cy = playerPosition.y * cellSize + cellSize / 2;
        if (slideStartRef.current !== null) slideStartRef.current = null;
      }

      historyRef.current.push({ cx, cy, t: now });
      while (historyRef.current.length > 0 && now - historyRef.current[0]!.t > HISTORY_WINDOW_MS) historyRef.current.shift();
      while (historyRef.current.length > HISTORY_MAX_SAMPLES) historyRef.current.shift();

      if (frame && lastSlidePath) {
        const currentCell = lastSlidePath[frame.cellsReached]!;
        const last = lastCellRef.current;
        if (!last || last.x !== currentCell.x || last.y !== currentCell.y) {
          dropsRef.current.push({ coord: currentCell, arrivedAt: now });
          lastCellRef.current = { x: currentCell.x, y: currentCell.y };
        }
      }
      while (dropsRef.current.length > 0 && now - dropsRef.current[0]!.arrivedAt > DROP_WINDOW_MS) dropsRef.current.shift();

      forceFrameTick((t) => (t + 1) % 1_000_000);

      const shouldContinue = frame !== null || dropsRef.current.length > 0 || needsContinuousRaf;
      if (shouldContinue) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [lastSlideAt, lastSlidePath, playerPosition.x, playerPosition.y, cellSize, WALL_H, needsContinuousRaf, backgroundEffect, ballEffect]);

  const now = performance.now();
  const frame = computeSlideFrame(lastSlidePath, slideStartRef.current, now);
  let fallbackX = playerPosition.x;
  let fallbackY = playerPosition.y;
  if (lastSlidePath && lastSlidePath.length > 0) {
    const lastCell = lastSlidePath[lastSlidePath.length - 1]!;
    fallbackX = lastCell.x;
    fallbackY = lastCell.y;
  }
  const ballX = frame ? frame.ballPos.x : fallbackX;
  const ballY = frame ? frame.ballPos.y : fallbackY;
  const ballCx = ballX * cellSize + cellSize / 2;
  const ballCy = ballY * cellSize + cellSize / 2;
  const playerRadius = cellSize * 0.32;

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

  const bgResult = renderBackgroundEffect({ effect: backgroundEffect, now });
  const hasBgOverlay = backgroundEffect !== 'none';

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

  // --- Render passes ---
  const wallElements: JSX.Element[] = [];
  const wallMaskRects: JSX.Element[] = [];
  const borderSharpElements: JSX.Element[] = [];
  const floorElements: JSX.Element[] = [];

  // Floor pass
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      if (row[x] !== 'floor') continue;
      const key = coordinateToKey({ x, y });
      const isPainted = paintedCells.has(key) && !maskedKeys.has(key);

      floorElements.push(
        <rect
          key={key}
          x={x * cellSize + pad}
          y={y * cellSize + pad}
          width={cellSize - pad * 2}
          height={cellSize - pad * 2}
          rx={3}
          fill={isPainted ? `url(#painted-tile-${palette.name})` : '#243b5e'}
          stroke={isPainted ? palette.paint1 : 'rgba(255,255,255,0.06)'}
          strokeWidth={isPainted ? 1.5 : 0.5}
          strokeOpacity={isPainted ? 0.6 : 1}
          data-cell-key={key}
          data-painted={isPainted ? 'true' : 'false'}
        />
      );
    }
  }

  // Wall pass + neon border detection
  for (let y = 0; y < maze.height; y++) {
    const row = maze.cells[y];
    if (!row) continue;
    for (let x = 0; x < maze.width; x++) {
      if (row[x] === 'floor') continue;
      const key = coordinateToKey({ x, y });

      wallElements.push(
        <rect
          key={`${key}-wall`}
          x={x * cellSize}
          y={y * cellSize}
          width={cellSize}
          height={cellSize}
          rx={3}
          fill="#0c1220"
        />
      );

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

      // Neon borders on edges facing floor cells
      const x0 = x * cellSize;
      const y0 = y * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;

      const edges: Array<{ lx1: number; ly1: number; lx2: number; ly2: number }> = [];
      if (maze.cells[y - 1]?.[x] === 'floor') edges.push({ lx1: x0, ly1: y0, lx2: x1, ly2: y0 });
      if (maze.cells[y + 1]?.[x] === 'floor') edges.push({ lx1: x0, ly1: y1, lx2: x1, ly2: y1 });
      if (maze.cells[y]?.[x - 1] === 'floor') edges.push({ lx1: x0, ly1: y0, lx2: x0, ly2: y1 });
      if (maze.cells[y]?.[x + 1] === 'floor') edges.push({ lx1: x1, ly1: y0, lx2: x1, ly2: y1 });

      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei]!;
        borderSharpElements.push(
          <line
            key={`${key}-bs-${ei}`}
            x1={e.lx1} y1={e.ly1} x2={e.lx2} y2={e.ly2}
            stroke={palette.wallBorder}
            strokeWidth={1.5}
            opacity={0.75}
          />
        );
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
        <linearGradient id={`painted-tile-${palette.name}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.paint1} />
          <stop offset="100%" stopColor={palette.paint2} />
        </linearGradient>
        <radialGradient id="ball-sphere" cx="40%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor={palette.ballBright} />
          <stop offset="75%" stopColor={palette.paint1} />
          <stop offset="100%" stopColor={palette.paint2} />
        </radialGradient>
        <filter id="ball-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
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

      {/* Background */}
      <rect x={0} y={0} width={size} height={svgHeight} fill={hasBgOverlay ? 'url(#bg-pattern)' : '#030712'} />

      {/* Walls */}
      {wallElements}

      {/* Wall pattern overlay */}
      {hasBgOverlay && (
        <rect
          x={0} y={0} width={size} height={svgHeight}
          fill="url(#bg-pattern)" opacity={0.7}
          mask="url(#wall-overlay-mask)"
        />
      )}

      {/* Wall border sharp */}
      {borderSharpElements}

      {/* Floor cells */}
      {floorElements}

      {/* Ball effects */}
      {ballResult.nodes}

      {/* Ball glow */}
      <circle
        cx={ballCx}
        cy={ballCy}
        r={playerRadius * 2.5}
        fill={palette.paint1}
        opacity="0.2"
        filter="url(#ball-glow)"
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
        cx={ballCx - playerRadius * 0.15}
        cy={ballCy - playerRadius * 0.15}
        rx={playerRadius * 0.22}
        ry={playerRadius * 0.18}
        fill="rgba(255,255,255,0.7)"
      />
    </svg>
  );
}
