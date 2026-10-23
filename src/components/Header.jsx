import { Bell, CheckCircle2, Menu } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { checkIntegrity } from '../services/reservationService.js';
import { remainingMins } from '../services/dispatchEngine.js';
import { timeAgo } from '../utils/timeUtils.js';
import { NAV } from './Sidebar.jsx';

export function useSystemStatus() {
  const { state, now } = useApp();
  return useMemo(() => {
    const integrity = checkIntegrity(state);
    const open = state.alerts.filter((a) => !a.resolved);
    const danger = open.filter((a) => a.severity === 'danger').length;
    const expiring = state.batches.filter((b) => b.qty.available > 0 && !b.cancelled && remainingMins(b, now) > 0 && remainingMins(b, now) <= 60).length;
    if (integrity.length) return { label: 'Integrity issue', cls: 'b-red', integrity };
    if (danger) return { label: `${danger} delivery at risk`, cls: 'b-red', integrity };
    if (open.length || expiring) return { label: 'Attention needed', cls: 'b-orange', integrity };
    return { label: 'All systems operational', cls: 'b-green', integrity };
  }, [state, now]);
}

export default function Header({ onMenu }) {
  const { state, route, navigate, run } = useApp();
  const [clock, setClock] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const status = useSystemStatus();

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const alerts = state.alerts.filter((a) => !a.resolved);
  const title = NAV.find((n) => n.id === route.page)?.label ?? '';
  const d = new Date(clock);

  return (
    <header className="header">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <div className="header-title">{title}</div>
      <div className="header-right">
        <span className={`status-pill ${status.cls}`}>
          <span className="status-dot" />
          {status.label}
        </span>
        <div className="clock mono">
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          <div>{d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <div style={{ position: 'relative' }} ref={ref}>
          <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
            <Bell size={17} />
            {alerts.length > 0 && <span className="bell-count">{alerts.length}</span>}
          </button>
          {open && (
            <div className="dropdown">
              <div className="dropdown-head">
                Notifications
                <span className="badge b-gray" style={{ marginLeft: 8 }}>{alerts.length} open</span>
              </div>
              <div className="dropdown-body">
                {alerts.length === 0 && (
                  <div className="empty">
                    <CheckCircle2 size={22} color="var(--green)" style={{ marginBottom: 6 }} />
                    <div>No open alerts. Everything is on track.</div>
                  </div>
                )}
                {alerts.map((a) => (
                  <div key={a.id} className="list-item">
                    <span className={`badge badge-dot ${a.severity === 'danger' ? 'b-red' : 'b-orange'}`} style={{ padding: '2px 6px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="strong" style={{ fontSize: 13 }}>{a.title}</div>
                      <div className="cell-sub">{a.message}</div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn btn-xs" onClick={() => { navigate('dispatch', { batchId: a.batchId }); setOpen(false); }}>
                          Open in Dispatch
                        </button>
                        {a.kind !== 'at-risk' && (
                          <button
                            className="btn btn-xs btn-ghost"
                            onClick={() => run((s, t) => {
                              const al = s.alerts.find((x) => x.id === a.id);
                              if (al) { al.resolved = true; al.resolvedAt = t; }
                            })}
                          >
                            Dismiss
                          </button>
                        )}
                        <span className="subtle" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{timeAgo(a.ts, clock)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="admin">
          <div className="avatar">OA</div>
          <div className="admin-name" style={{ lineHeight: 1.25 }}>
            <div className="strong" style={{ fontSize: 13 }}>Ops Admin</div>
            <div className="subtle" style={{ fontSize: 11.5 }}>Control room</div>
          </div>
        </div>
      </div>
    </header>
  );
}
