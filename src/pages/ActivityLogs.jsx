import { Download, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import { addLog } from '../services/logService.js';

export default function ActivityLogs() {
  const { state, run, confirm, toast } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const types = [...new Set(state.logs.map((l) => l.type))].sort();
  const term = q.trim().toLowerCase();
  const logs = state.logs.filter(
    (l) =>
      (!status || l.status === status) &&
      (!type || l.type === type) &&
      (!term || `${l.description} ${l.batchId ?? ''} ${l.riderId ?? ''} ${l.type}`.toLowerCase().includes(term)),
  );

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Timestamp', 'Event', 'Description', 'Batch', 'Rider', 'Status'], ...logs.map((l) => [new Date(l.ts).toISOString(), l.type, l.description, l.batchId, l.riderId, l.status])];
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rescueflow-activity-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const clear = async () => {
    const ok = await confirm({ title: 'Clear activity log?', message: 'All log entries will be removed. Donations, riders and shelters are not affected.', confirmLabel: 'Clear log', danger: true });
    if (!ok) return;
    run((s, now) => {
      s.logs = [];
      addLog(s, now, { type: 'Log cleared', description: 'Activity log cleared by operator', status: 'info' });
    });
    toast('success', 'Log cleared');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Activity Logs</h1>
          <p>Every decision the system makes is recorded with a reason — dispatches, timeouts, stock releases, reroutes and blocked unsafe actions. Saved in this browser.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={exportCsv} disabled={!logs.length}><Download size={15} /> Export CSV</button>
          <button className="btn btn-danger" onClick={clear}><Trash2 size={15} /> Clear log</button>
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--subtle)' }} />
            <input className="input" style={{ paddingLeft: 30, minWidth: 260 }} placeholder="Search events, batch or rider" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All event types</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="danger">Critical</option>
          </select>
          <span className="subtle" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{logs.length} of {state.logs.length} events</span>
        </div>
        <ActivityLog logs={logs} />
      </div>
    </div>
  );
}
