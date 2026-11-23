interface Props {
  label: string;
  value: number;
  tone?: 'gold' | 'cyan' | 'violet' | 'red' | 'neutral';
}

export function StatBar({ label, value, tone = 'gold' }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="stat-bar">
      <div className="stat-bar-head">
        <span>{label}</span>
        <strong>{clamped}</strong>
      </div>
      <div className="stat-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label}>
        <div className={`stat-bar-fill tone-${tone}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
