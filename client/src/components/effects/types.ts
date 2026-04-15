import type { Coordinate } from '@skillgames/shared';

export type BallEffectId =
  | 'none'
  | 'meteor'
  | 'plasma'
  | 'lightning';

export type BackgroundEffectId =
  | 'none'
  | 'space';

export const BALL_EFFECT_OPTIONS: ReadonlyArray<{ id: BallEffectId; label: string }> = [
  { id: 'none',         label: 'None' },
  { id: 'meteor',       label: 'Meteor fire tail' },
  { id: 'plasma',       label: 'Plasma ribbon' },
  { id: 'lightning',    label: 'Lightning arc' },
];

export const BACKGROUND_EFFECT_OPTIONS: ReadonlyArray<{ id: BackgroundEffectId; label: string }> = [
  { id: 'none',         label: 'None' },
  { id: 'space',        label: 'Deep space' },
];

/**
 * Wall styling. Walls always render solid dark slate; background effects do
 * NOT modify wall fills — they paint a separate masked overlay layer on top.
 */
export interface WallTheme {
  /** Fill for the wall top face */
  readonly topFill: string;
  /** Fill for the wall front (3D edge) face */
  readonly sideFill: string;
}

export const DEFAULT_WALL_THEME: WallTheme = {
  topFill: '#1e293b',
  sideFill: '#0f1729',
};

/**
 * A ball position sample for trail effects. Recorded each rAF frame while the
 * ball is animating.
 */
export interface BallSample {
  /** Pixel x of ball center at time t */
  readonly cx: number;
  /** Pixel y of ball center at time t */
  readonly cy: number;
  /** performance.now() timestamp */
  readonly t: number;
}

export interface CellDrop {
  /** Grid cell the ball left */
  readonly coord: Coordinate;
  /** performance.now() timestamp when the ball arrived here */
  readonly arrivedAt: number;
}
