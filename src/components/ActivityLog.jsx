import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { formatTimeWithSeconds, timeAgo } from '../utils/timeUtils.js';
import { Empty, StatusBadge } from './ui.jsx';

const ICON = {
  success: [CheckCircle2, 'var(--green-soft)', 'var(--green)'],
  info: [Info, 'var(--blue-soft)', 'var(--blue)'],
  warning: [AlertTriangle, 'var(--orange-soft)', 'var(--orange)'],
  danger: [AlertOctagon, 'var(--red-soft)', 'var(--red)'],
};

// Compact feed (dashboard)
export function ActivityFeed({ logs }) {
  const { now } = useApp();
  if (!logs.length) return <Empty>No events yet</Empty>;
  return (
    <div className="list">
      {logs.map((l) => {
        const [Icon, bg, fg] = ICON[l.status] ?? ICON.info;
        return (
          <div className="list-item" key={l.id} style={{ padding: '10px 18px' }}>
            <div className="dot-icon" style={{ background: bg, color: fg, width: 26, height: 26 }}><Icon size={14} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row">
                <span className="strong" style={{ fontSize: 13 }}>{l.type}</span>
                <span className="subtle" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{timeAgo(l.ts, now)}</span>
              </div>
              <div className="cell-sub">{l.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Full table (Activity Logs page)
export default function ActivityLog({ logs }) {
  const { state } = useApp();
  if (!logs.length) return <Empty>No events match these filters</Empty>;
  const riderName = (id) => state.riders.find((r) => r.id === id)?.name ?? id;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Description</th>
            <th>Batch</th>
            <th>Rider</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="mono nowrap">
                {formatTimeWithSeconds(l.ts)}
                <div className="cell-sub">{new Date(l.ts).toLocaleDateString([], { day: '2-digit', month: 'short' })}</div>
              </td>
              <td className="strong nowrap">{l.type}</td>
              <td style={{ minWidth: 280 }}>{l.description}</td>
              <td className="mono nowrap">{l.batchId ?? '—'}</td>
              <td className="nowrap">{l.riderId ? riderName(l.riderId) : '—'}</td>
              <td><StatusBadge status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
