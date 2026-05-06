import type { DebugInfo } from './types.js';

interface Props {
  info: DebugInfo;
}

export function DebugOverlay({ info }: Props): JSX.Element {
  return (
    <div className="fixed top-2 left-2 z-50 bg-black/80 text-xs text-green-400 font-mono p-3 rounded-lg max-w-[280px] pointer-events-none">
      <p>phase: {info.phase}</p>
      <p>seed: {info.seed ? info.seed.slice(0, 16) + '...' : '---'}</p>
      <p>
        tap: {info.lastTapNormalized
          ? `(${info.lastTapNormalized.x.toFixed(3)}, ${info.lastTapNormalized.y.toFixed(3)})`
          : '---'}
      </p>
      <p>reaction: {info.lastReactionMs !== null ? `${info.lastReactionMs}ms` : '---'}</p>
      <p>on-target: {info.lastOnTarget !== null ? String(info.lastOnTarget) : '---'}</p>
      {info.currentPrompt && (
        <>
          <p>shape: {info.currentPrompt.shape} / {info.currentPrompt.color}</p>
          <p>
            pos: ({info.currentPrompt.position.x.toFixed(2)}, {info.currentPrompt.position.y.toFixed(2)})
            size: {info.currentPrompt.size}
          </p>
        </>
      )}
    </div>
  );
}
