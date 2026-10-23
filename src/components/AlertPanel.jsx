import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Send } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { batchBlockReason, remainingMins } from '../services/dispatchEngine.js';
import { formatDuration, timeAgo } from '../utils/timeUtils.js';
import { AssignmentActions } from './AssignmentTable.jsx';

const AT_RISK_ACTIONS = [
  'Call nearby shelter coordinators to confirm emergency intake',
  'Raise demand at another shelter, then press "Retry reroute"',
  'Hand over to a community fridge / kitchen if food-safe',
  'If no safe option remains before expiry, record safe disposal',
];

export default function AlertPanel({ limit = 6 }) {
  const { state, now, navigate, run } = useApp();
  const alerts = state.alerts.filter((a) => !a.resolved);
  const expiring = state.batches
    .filter((b) => !batchBlockReason(b, now) && remainingMins(b, now) <= 120)
    .sort((a, b) => a.expiresAt - b.expiresAt);

  if (!alerts.length && !expiring.length) {
    return (
      <div className="empty">
        <CheckCircle2 size={22} color="var(--green)" style={{ marginBottom: 6 }} />
        <div>No urgent issues. All perishable batches have safe time left.</div>
      </div>
    );
  }

  return (
    <div className="list">
      {alerts.slice(0, limit).map((al) => {
        const a = al.assignmentId ? state.assignments.find((x) => x.id === al.assignmentId) : null;
        const danger = al.severity === 'danger';
        return (
          <div key={al.id} className="list-item" style={{ background: danger ? '#fffafa' : undefined }}>
            <div className="dot-icon" style={{ background: danger ? 'var(--red-soft)' : 'var(--orange-soft)', color: danger ? 'var(--red)' : 'var(--orange)' }}>
              {danger ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row">
                <span className="strong" style={{ fontSize: 13.5 }}>{al.title}</span>
                <span className="subtle" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{timeAgo(al.ts, now)}</span>
              </div>
              <div className="cell-sub" style={{ marginTop: 2 }}>{al.message}</div>
              {al.kind === 'at-risk' && !a?.expiredCargo && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--muted)' }}>
                  {AT_RISK_ACTIONS.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
              <div className="row wrap" style={{ marginTop: 8 }}>
                {a && a.status === 'At Risk' && <AssignmentActions a={a} />}
                {al.kind !== 'at-risk' && al.batchId && (
                  <button className="btn btn-xs" onClick={() => navigate('dispatch', { batchId: al.batchId })}><Send size={12} /> Open in Dispatch</button>
                )}
                {al.kind !== 'at-risk' && (
                  <button className="btn btn-xs btn-ghost" onClick={() => run((s, t) => { const x = s.alerts.find((y) => y.id === al.id); if (x) { x.resolved = true; x.resolvedAt = t; } })}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {expiring.slice(0, Math.max(0, limit - alerts.length)).map((b) => {
        const rem = remainingMins(b, now);
        return (
          <div key={b.id} className="list-item">
            <div className="dot-icon" style={{ background: rem <= 60 ? 'var(--red-soft)' : 'var(--orange-soft)', color: rem <= 60 ? 'var(--red)' : 'var(--orange)' }}>
              <Clock size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="strong" style={{ fontSize: 13.5 }}>{b.id} expires in {formatDuration(rem)}</div>
              <div className="cell-sub">{b.qty.available} {b.unit} of {b.category.toLowerCase()} from {b.donor} not yet dispatched</div>
            </div>
            <button className="btn btn-xs btn-primary" onClick={() => navigate('dispatch', { batchId: b.id })}><Send size={12} /> Dispatch</button>
          </div>
        );
      })}
    </div>
  );
}
