import { useState } from 'react';

interface Props {
  onFalseStart: (timestamp: number) => void;
}

export function DelayScreen({ onFalseStart }: Props): JSX.Element {
  const [flashing, setFlashing] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setFlashing(true);
    onFalseStart(performance.now());
  };

  return (
    <div
      className={`flex flex-col items-center justify-center h-full cursor-pointer ${flashing ? 'animate-flash-red' : ''}`}
      onPointerDown={handlePointerDown}
    >
      <div className="w-4 h-4 rounded-full border-2 border-slate-700" />
      <p className="text-slate-600 text-sm tracking-widest uppercase mt-6">
        Wait...
      </p>
    </div>
  );
}
