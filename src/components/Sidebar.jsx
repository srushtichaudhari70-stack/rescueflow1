import { Activity, Bike, Building2, FlaskConical, LayoutDashboard, Package, Route, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

export const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'donations', label: 'Donations', icon: Package },
  { id: 'riders', label: 'Riders', icon: Bike },
  { id: 'shelters', label: 'Shelters', icon: Building2 },
  { id: 'dispatch', label: 'Dispatch Center', icon: Route },
  { id: 'simulator', label: 'Failure Simulator', icon: FlaskConical },
  { id: 'logs', label: 'Activity Logs', icon: Activity },
];

export default function Sidebar({ open, onNavigate }) {
  const { route, navigate, state } = useApp();
  const openAlerts = state.alerts.filter((a) => !a.resolved).length;
  const awaiting = state.assignments.filter((a) => a.status === 'Awaiting Ack' || a.status === 'At Risk').length;

  const counts = { dispatch: awaiting + openAlerts };
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="logo">
        <div className="logo-mark">
          <ShieldCheck size={19} strokeWidth={2.4} />
        </div>
        <div>
          <div className="logo-text">RescueFlow</div>
          <div className="logo-sub">Perishable aid coordination</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${route.page === id ? 'active' : ''}`}
            onClick={() => {
              navigate(id);
              onNavigate?.();
            }}
          >
            <Icon size={17} />
            {label}
            {counts[id] > 0 && <span className="count">{counts[id]}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        Prototype · data stored in this browser
      </div>
    </aside>
  );
}
