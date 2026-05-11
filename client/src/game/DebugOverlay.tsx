import type { DebugInfo } from './types.js';

interface Props {
  info: DebugInfo;
}

export function DebugOverlay({ info }: Props): JSX.Element {
  return (
    <div className="fixed top-2 left-2 z-50 bg-black/80 text-xs text-green-400 font-mono p-3 rounded-lg max-w-[320px] pointer-events-none">
      <p>phase: {info.phase}</p>
      <p>seed: {info.seed ? info.seed.slice(0, 16) + '...' : '---'}</p>
      <p>round: {info.roundIndex + 1}, prompt: {info.promptIndex + 1}/{info.totalPrompts}</p>
      <p>
        tap: {info.lastTapNormalized
          ? `(${info.lastTapNormalized.x.toFixed(3)}, ${info.lastTapNormalized.y.toFixed(3)})`
          : '---'}
      </p>
      <p>reaction: {info.lastReactionMs !== null ? `${info.lastReactionMs}ms` : '---'}</p>
      <p>on-target: {info.lastOnTarget !== null ? String(info.lastOnTarget) : '---'}</p>
      <p>running score: {info.runningScore}ms</p>
      {info.currentPrompt && (
        <>
          <p>shape: {info.currentPrompt.shape} / {info.currentPrompt.color}</p>
          <p>
            pos: ({info.currentPrompt.position.x.toFixed(2)}, {info.currentPrompt.position.y.toFixed(2)})
            size: {info.currentPrompt.size}
          </p>
        </>
      )}
      {info.opponentRoundResults && (
        <p>opp results: {info.opponentRoundResults.map(r =>
          r.hit ? `${r.reactionMs}` : r.falseStart ? 'FS' : 'M'
        ).join(' ')}</p>
      )}
    </div>
  );
}
