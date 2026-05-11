interface Props {
  value: number;
}

export function CountdownScreen({ value }: Props): JSX.Element {
  const display = value === 0 ? 'GO!' : String(value);
  const color = value === 0 ? 'text-cyan-400' : 'text-white';

  return (
    <div className="flex items-center justify-center h-full">
      <p
        key={value}
        className={`text-8xl font-extrabold ${color} animate-countdown-pop`}
        style={{ textShadow: '0 0 40px rgba(255,255,255,0.15)' }}
      >
        {display}
      </p>
    </div>
  );
}
