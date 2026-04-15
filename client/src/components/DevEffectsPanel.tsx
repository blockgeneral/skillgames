import { useEffect, useState } from 'react';
import type { BallEffectId, BackgroundEffectId } from './effects/types.js';
import { BALL_EFFECT_OPTIONS, BACKGROUND_EFFECT_OPTIONS } from './effects/types.js';

const STORAGE_KEY_BALL = 'skillgames.fx.ball';
const STORAGE_KEY_BG = 'skillgames.fx.bg';

export interface EffectSelection {
  readonly ball: BallEffectId;
  readonly background: BackgroundEffectId;
}

function readStored(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function useEffectSelection(): [EffectSelection, (next: EffectSelection) => void] {
  const [selection, setSelection] = useState<EffectSelection>(() => ({
    ball: readStored(STORAGE_KEY_BALL, 'none') as BallEffectId,
    background: readStored(STORAGE_KEY_BG, 'none') as BackgroundEffectId,
  }));
  const update = (next: EffectSelection): void => {
    setSelection(next);
    try {
      sessionStorage.setItem(STORAGE_KEY_BALL, next.ball);
      sessionStorage.setItem(STORAGE_KEY_BG, next.background);
    } catch {
      // ignore
    }
  };
  return [selection, update];
}

export interface DevEffectsPanelProps {
  selection: EffectSelection;
  onChange: (next: EffectSelection) => void;
}

/**
 * Dev-only floating panel for toggling ball and background effects.
 * Only rendered when import.meta.env.DEV is true. Collapsible.
 */
export function DevEffectsPanel({ selection, onChange }: DevEffectsPanelProps): JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false);

  // Keyboard shortcut: 'f' to toggle collapse
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed top-2 right-2 z-50 px-2 py-1 text-xs rounded bg-slate-800/80 text-slate-300 border border-slate-700"
      >
        FX
      </button>
    );
  }

  return (
    <div className="fixed top-2 right-2 z-50 w-56 rounded-lg bg-slate-900/95 border border-slate-700 p-3 text-xs shadow-xl backdrop-blur">
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-400 font-semibold uppercase tracking-wide">FX Dev Panel</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-slate-500 hover:text-slate-300"
          aria-label="Collapse panel"
        >
          ×
        </button>
      </div>

      <label className="block mb-3">
        <span className="block text-slate-400 mb-1">Ball effect</span>
        <select
          value={selection.ball}
          onChange={(e) => onChange({ ...selection, ball: e.target.value as BallEffectId })}
          className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
        >
          {BALL_EFFECT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-slate-400 mb-1">Background</span>
        <select
          value={selection.background}
          onChange={(e) => onChange({ ...selection, background: e.target.value as BackgroundEffectId })}
          className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-2 py-1"
        >
          {BACKGROUND_EFFECT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="mt-2 text-slate-600 text-[10px]">press <kbd className="bg-slate-800 px-1 rounded">f</kbd> to toggle</div>
    </div>
  );
}
