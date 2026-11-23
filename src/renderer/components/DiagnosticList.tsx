import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DiagnosticCheck } from '../../shared/ipc';

interface Props {
  checks: DiagnosticCheck[];
}

export function DiagnosticList({ checks }: Props) {
  return (
    <ul className="diagnostic-list">
      {checks.map((check) => (
        <li key={check.name} className={check.ok ? 'check ok' : 'check failed'}>
          {check.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{check.name}</span>
          {check.detail ? <span className="detail">{check.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
