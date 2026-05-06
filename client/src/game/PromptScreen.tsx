import { useState, useCallback } from 'react';
import type { Prompt } from '@skillgamez/shared';

interface Props {
  prompt: Prompt;
  onTap: (normalizedX: number, normalizedY: number, timestamp: number, isTrusted: boolean) => void;
}

const COLORS: Record<string, string> = {
  red: '#FF3B3B',
  blue: '#3B82FF',
  green: '#22C55E',
  yellow: '#FACC15',
};

interface Ripple {
  id: number;
  x: number;
  y: number;
}

let rippleId = 0;

export function PromptScreen({ prompt, onTap }: Props): JSX.Element {
  const [hit, setHit] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [tapped, setTapped] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (tapped) return; // Only first tap counts

      const timestamp = performance.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const normalizedX = (e.clientX - rect.left) / rect.width;
      const normalizedY = (e.clientY - rect.top) / rect.height;

      // Add ripple
      const newRipple = { id: ++rippleId, x: e.clientX - rect.left, y: e.clientY - rect.top };
      setRipples((r) => [...r, newRipple]);
      setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== newRipple.id)), 400);

      setTapped(true);
      setHit(true);
      if (e.isTrusted !== undefined) {
        console.log('[QuickDraw] isTrusted:', e.isTrusted);
      }
      onTap(normalizedX, normalizedY, timestamp, e.isTrusted);
    },
    [onTap, tapped],
  );

  const vmin = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 400;
  const pxSize = prompt.size * vmin;

  const shapeStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${prompt.position.x * 100}%`,
    top: `${prompt.position.y * 100}%`,
    transform: 'translate(-50%, -50%) scale(1)',
  };

  const color = COLORS[prompt.color] ?? '#fff';

  return (
    <div
      className="relative w-full h-full"
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
    >
      {/* Ripples */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="absolute animate-ripple pointer-events-none rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 80,
            height: 80,
            border: `2px solid ${color}`,
          }}
        />
      ))}

      {/* Shape */}
      <div
        className={`animate-pop-in ${hit ? 'animate-flash-white' : ''}`}
        style={shapeStyle}
      >
        {prompt.shape === 'circle' && (
          <div
            style={{
              width: pxSize * 2,
              height: pxSize * 2,
              borderRadius: '50%',
              backgroundColor: color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {prompt.shape === 'square' && (
          <div
            style={{
              width: pxSize * 2,
              height: pxSize * 2,
              backgroundColor: color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {prompt.shape === 'triangle' && (
          <svg
            width={pxSize * 2}
            height={pxSize * 2}
            viewBox="0 0 100 100"
            style={{ transform: 'translate(-50%, -50%)', overflow: 'visible' }}
          >
            <polygon
              points="50,6.7 93.3,75 6.7,75"
              fill={color}
            />
          </svg>
        )}
      </div>
    </div>
  );
}
