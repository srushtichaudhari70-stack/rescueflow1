import { AlertTriangle, ArrowRight, Bike, Boxes, CheckCircle2, Clock4, PackagePlus, Siren, Truck, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import StatCard from '../components/StatCard.jsx';
import AssignmentTable from '../components/AssignmentTable.jsx';
import DonationTable from '../components/DonationTable.jsx';
import AlertPanel from '../components/AlertPanel.jsx';
import { ActivityFeed } from '../components/ActivityLog.jsx';
import DonationForm from '../components/DonationForm.jsx';
import BatchDetails from '../components/BatchDetails.jsx';
import { Progress, StatusBadge } from '../components/ui.jsx';
import { ACTIVE_STATUSES, isDispatchable, remainingMins, shelterInbound } from '../services/dispatchEngine.js';
import { scenarioUrgentDonation } from '../services/scenarioService.js';

export function useKpis() {
  const { state, now } = useApp();
  return useMemo(() => {
    const activeBatches = state.batches.filter((b) => ['Available', 'Reserved', 'Assigned', 'In Transit'].includes(b.status));
    const availableUnits = state.batches.filter((b) => isDispatchable(b, now)).reduce((n, b) => n + b.qty.available, 0);
    const activeRiders = state.riders.filter((r) => !['Off Duty', 'Unresponsive'].includes(r.status));
    const pending = state.assignments.filter((a) => ACTIVE_STATUSES.includes(a.status));
    const rescued = state.batches.filter((b) => b.status === 'Delivered');
    const delivered = state.batches.reduce((n, b) => n + b.qty.delivered, 0);
    const atRiskIds = new Set(state.assignments.filter((a) => a.status === 'At Risk').map((a) => a.batchId));
    for (const b of state.batches) if (isDispatchable(b, now) && remainingMins(b, now) <= 60) atRiskIds.add(b.id);
    return { activeBatches, availableUnits, activeRiders, pending, rescued, delivered, atRisk: atRiskIds.size };
  }, [state, now]);
}

export default function Dashboard() {
  const { state, now, navigate, run, toast } = useApp();
  const k = useKpis();
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editBatch, setEditBatch] = useState(null);

  const active = state.assignments.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const batches = state.batches.filter((b) => !['Delivered', 'Cancelled', 'Expired'].includes(b.status)).sort((a, b) => a.expiresAt - b.expiresAt).slice(0, 6);
  const riderCounts = state.riders.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});

  const emergency = () => {
    const res = run((s, t) => scenarioUrgentDonation(s, t));
    if (res.ok) {
      toast('warning', 'Emergency donation received', `${res.batchId}: 180 meals with 75 min shelf-life added to the dispatch queue`);
      navigate('dispatch', { batchId: res.batchId });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Operations overview</h1>
          <p>Live view of perishable donations, riders and shelters. Every assignment is checked for expiry, capacity, demand and compatibility.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-warning" onClick={emergency}><Siren size={15} /> Simulate emergency</button>
          <button className="btn" onClick={() => setShowForm(true)}><PackagePlus size={15} /> New donation</button>
          <button className="btn btn-primary" onClick={() => navigate('dispatch')}>Dispatch Center <ArrowRight size={15} /></button>
        </div>
      </div>

      <div className="kpi-grid">
        <StatCard label="Active donation batches" value={k.activeBatches.length} icon={Boxes} tone="navy" foot={`${state.batches.length} total batches`} />
        <StatCard label="Available aid units" value={k.availableUnits} icon={Utensils} tone="blue" foot="Ready to dispatch now" />
        <StatCard label="Active riders" value={k.activeRiders.length} icon={Bike} tone="violet" foot={`${riderCounts.Available ?? 0} free right now`} />
        <StatCard label="Pending deliveries" value={k.pending.length} icon={Truck} tone="orange" foot={`${k.pending.filter((a) => a.status === 'Awaiting Ack').length} awaiting acknowledgment`} />
        <StatCard label="Rescued batches" value={k.rescued.length} icon={CheckCircle2} tone="green" foot={`${k.delivered} units delivered`} />
        <StatCard label="At-risk batches" value={k.atRisk} icon={AlertTriangle} tone="red" foot="Expiring < 60 min or stranded" />
      </div>

      <div className="grid cols-main">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <Truck size={16} color="var(--brand)" />
              <h3>Live dispatch overview</h3>
              <span className="sub">{active.length} active</span>
              <div className="right"><button className="btn btn-sm" onClick={() => navigate('dispatch')}>Manage</button></div>
            </div>
            <AssignmentTable assignments={active} now={now} emptyText="No deliveries in progress. Open the Dispatch Center to assign riders." />
          </div>

          <div className="card">
            <div className="card-head">
              <Boxes size={16} color="var(--brand)" />
              <h3>Donation batches</h3>
              <span className="sub">sorted by expiry</span>
              <div className="right"><button className="btn btn-sm" onClick={() => navigate('donations')}>View all</button></div>
            </div>
            <DonationTable batches={batches} now={now} compact onView={(b) => setViewId(b.id)} onDispatch={(b) => navigate('dispatch', { batchId: b.id })} />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <Clock4 size={16} color="var(--red)" />
              <h3>Urgent expiry alerts</h3>
            </div>
            <AlertPanel limit={5} />
          </div>

          <div className="card">
            <div className="card-head">
              <Bike size={16} color="var(--brand)" />
              <h3>Rider availability</h3>
              <div className="right"><button className="btn btn-sm" onClick={() => navigate('riders')}>Riders</button></div>
            </div>
            <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
              {state.riders.map((r) => (
                <div key={r.id} className="row" style={{ padding: '6px 0', fontSize: 13 }}>
                  <span className="strong" style={{ width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <div style={{ flex: 1 }}><Progress value={r.load} max={r.capacity} color="var(--blue)" /></div>
                  <span className="mono subtle" style={{ width: 44, textAlign: 'right' }}>{r.load}/{r.capacity}</span>
                  <span style={{ width: 106, textAlign: 'right' }}><StatusBadge status={r.status} /></span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <Utensils size={16} color="var(--brand)" />
              <h3>Shelter demand</h3>
              <div className="right"><button className="btn btn-sm" onClick={() => navigate('shelters')}>Shelters</button></div>
            </div>
            <div className="card-body">
              {state.shelters.map((sh) => {
                const total = Object.values(sh.demand).reduce((n, d) => n + d, 0);
                const inbound = shelterInbound(state, sh.id, '').total;
                return (
                  <div key={sh.id} style={{ marginBottom: 12 }}>
                    <div className="row" style={{ fontSize: 13, marginBottom: 4 }}>
                      <span className="strong">Shelter {sh.code}</span>
                      <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sh.name}</span>
                      <span className="spacer" />
                      {sh.status === 'Closed' ? <StatusBadge status="Closed" /> : <span className="mono subtle">{inbound} inbound / {total} needed</span>}
                    </div>
                    <Progress value={inbound} max={total || 1} color={sh.status === 'Closed' ? '#cbd5e1' : 'var(--green)'} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <CheckCircle2 size={16} color="var(--brand)" />
              <h3>Recent operational events</h3>
              <div className="right"><button className="btn btn-sm" onClick={() => navigate('logs')}>All logs</button></div>
            </div>
            <ActivityFeed logs={state.logs.slice(0, 7)} />
          </div>
        </div>
      </div>

      {showForm && <DonationForm onClose={() => setShowForm(false)} />}
      {editBatch && <DonationForm batch={editBatch} onClose={() => setEditBatch(null)} />}
      {viewId && <BatchDetails batchId={viewId} onClose={() => setViewId(null)} onEdit={(b) => setEditBatch(b)} />}
    </div>
  );
}
