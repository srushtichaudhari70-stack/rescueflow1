import { Bike, Clock, Gauge, Moon, Power, UserCheck, Ghost } from 'lucide-react';
import { useApp, useAction } from '../context/AppContext.jsx';
import { getShelter } from '../services/dispatchEngine.js';
import { setRiderAvailability, toggleGhost } from '../services/reservationService.js';
import { Progress, StatusBadge } from './ui.jsx';

export default function RiderCard({ rider }) {
  const { state, confirm } = useApp();
  const act = useAction();
  const a = rider.currentAssignment ? state.assignments.find((x) => x.id === rider.currentAssignment) : null;
  const shelter = a ? getShelter(state, a.shelterId) : null;
  const relColor = rider.reliability >= 85 ? 'var(--green)' : rider.reliability >= 65 ? 'var(--orange)' : 'var(--red)';

  const reinstate = async () => {
    const ok = await confirm({ title: `Reinstate ${rider.name}?`, message: 'The rider will be available for new assignments again (still excluded from batches they missed).', confirmLabel: 'Reinstate' });
    if (ok) act((s, now) => setRiderAvailability(s, now, rider.id, 'Available'), { success: 'Rider reinstated', successMsg: rider.name });
  };

  return (
    <div className="card entity">
      <div className="entity-head">
        <div className="dot-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)', width: 38, height: 38, borderRadius: 10 }}>
          <Bike size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="entity-name">{rider.name}</div>
          <div className="entity-meta">{rider.id} · {rider.vehicle} · {rider.zone}</div>
        </div>
        <StatusBadge status={rider.status} />
      </div>

      <div>
        <div className="row" style={{ fontSize: 12.5, marginBottom: 5 }}>
          <span className="muted">Carrying</span>
          <span className="spacer" />
          <b className="mono">{rider.load} / {rider.capacity}</b>
        </div>
        <Progress value={rider.load} max={rider.capacity} color="var(--blue)" />
      </div>

      <div className="entity-stats">
        <div className="stat-mini"><div className="l"><Gauge size={11} /> Reliability</div><div className="v mono" style={{ color: relColor }}>{rider.reliability}%</div></div>
        <div className="stat-mini"><div className="l"><Clock size={11} /> To pickup</div><div className="v mono">{rider.travelMins}m</div></div>
        <div className="stat-mini"><div className="l">Trips</div><div className="v mono">{rider.completed}</div></div>
      </div>

      <div style={{ fontSize: 12.5 }} className="muted">
        {a ? (
          <>Current: <b style={{ color: 'var(--text)' }}>{a.id}</b> · {a.qty} {a.unit} → Shelter {shelter?.code} <StatusBadge status={a.status} dot={false} /></>
        ) : (
          'No current assignment'
        )}
      </div>
      {rider.excludedBatches.length > 0 && (
        <div className="cell-sub" style={{ color: 'var(--orange)' }}>Excluded from: {rider.excludedBatches.join(', ')} (missed acknowledgment)</div>
      )}

      <div className="entity-actions">
        {rider.status === 'Unresponsive' && (
          <button className="btn btn-sm btn-success" onClick={reinstate}><UserCheck size={14} /> Reinstate</button>
        )}
        {rider.status === 'Off Duty' && (
          <button className="btn btn-sm" onClick={() => act((s, now) => setRiderAvailability(s, now, rider.id, 'Available'), { success: 'Rider on duty', successMsg: rider.name })}>
            <Power size={14} /> Set available
          </button>
        )}
        {rider.status === 'Available' && (
          <button className="btn btn-sm" onClick={() => act((s, now) => setRiderAvailability(s, now, rider.id, 'Off Duty'), { success: 'Rider off duty', successMsg: rider.name })}>
            <Moon size={14} /> Set off duty
          </button>
        )}
        <button
          className={`btn btn-sm ${rider.ghost ? 'btn-warning' : 'btn-ghost'}`}
          onClick={() => act((s, now) => toggleGhost(s, now, rider.id), { success: 'Simulation updated', successMsg: (r) => `${rider.name} will ${r.ghost ? 'ignore' : 'answer'} new reservations` })}
          title="Simulation: make this rider ignore reservations"
        >
          <Ghost size={14} /> {rider.ghost ? 'Unresponsive (sim) ✓' : 'Simulate unresponsive'}
        </button>
      </div>
    </div>
  );
}
