import { useState } from 'react';
import type { Difficulty } from '@skillgames/shared';
import { DIFFICULTY_CONFIGS } from '@skillgames/shared';
import type { BallEffectId, BackgroundEffectId } from '../components/effects/types.js';
import { BALL_EFFECT_OPTIONS, BACKGROUND_EFFECT_OPTIONS } from '../components/effects/types.js';

export interface HomeScreenProps {
  onStartGame: (difficulty: Difficulty) => void;
  ballEffect: BallEffectId;
  backgroundEffect: BackgroundEffectId;
  onBallEffectChange: (id: BallEffectId) => void;
  onBackgroundEffectChange: (id: BackgroundEffectId) => void;
  timeless: boolean;
  onTimelessChange: (v: boolean) => void;
}

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export function HomeScreen({
  onStartGame,
  ballEffect,
  backgroundEffect,
  onBallEffectChange,
  onBackgroundEffectChange,
  timeless,
  onTimelessChange,
}: HomeScreenProps): JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const handlePlay = (): void => {
    onStartGame(difficulty);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-5 bg-slate-900">
      <div className="flex flex-col items-center gap-6 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white text-center">
          Maze Paint
        </h1>
        <p className="text-base text-slate-400 text-center">
          Paint the maze before time runs out!
        </p>

        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-sm text-slate-400">Difficulty</p>
          <div className="flex gap-2 w-full">
            {DIFFICULTY_OPTIONS.map((opt) => {
              const config = DIFFICULTY_CONFIGS[opt.value];
              const isSelected = difficulty === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setDifficulty(opt.value)}
                  className={`
                    flex-1 flex flex-col items-center gap-1 py-3 px-2
                    border-2 rounded-xl cursor-pointer transition-all
                    ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-400/15'
                        : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                    }
                  `}
                >
                  <span className="text-base font-semibold text-white">
                    {opt.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {config.widthMin}-{config.widthMax} x {config.heightMin}-{config.heightMax}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeless toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={timeless}
            onChange={(e) => onTimelessChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-400 focus:ring-emerald-400"
          />
          <span className="text-sm text-slate-400">Timeless (no timer)</span>
        </label>

        {/* Effects selection */}
        <div className="flex flex-col gap-3 w-full">
          <p className="text-sm text-slate-400 text-center">Effects</p>
          <div className="flex gap-3 w-full">
            <label className="flex-1">
              <span className="block text-xs text-slate-500 mb-1">Ball</span>
              <select
                value={ballEffect}
                onChange={(e) => onBallEffectChange(e.target.value as BallEffectId)}
                className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"
              >
                {BALL_EFFECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-xs text-slate-500 mb-1">Background</span>
              <select
                value={backgroundEffect}
                onChange={(e) => onBackgroundEffectChange(e.target.value as BackgroundEffectId)}
                className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"
              >
                {BACKGROUND_EFFECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <button
          onClick={handlePlay}
          className="
            w-full mt-4 py-4 px-6 rounded-xl
            bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600
            text-white font-bold text-lg
            transition-colors
          "
        >
          Play
        </button>
      </div>
    </div>
  );
}
