import { Building2, Clock, DoorClosed, DoorOpen, MapPin, PencilLine, ZapOff } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, RESOURCES } from '../data/constants.js';
import { useApp } from '../context/AppContext.jsx';
import { shelterInbound } from '../services/dispatchEngine.js';
import { updateShelter } from '../services/reservationService.js';
import { Modal, Progress, StatusBadge } from './ui.jsx';

// Shows the result of a shelter change (reroutes, at-risk, releases) as a toast.
export function useShelterUpdate() {
  const { run, toast } = useApp();
  return (id, changes, note, successTitle) => {
    const res = run((s, now) => updateShelter(s, now, id, changes, { note }));
    if (!res.ok) {
      toast('error', 'Update blocked', res.reason);
      return res;
    }
    const r = res.result;
    if (!r) {
      toast('info', 'No changes', 'Nothing was different');
      return res;
    }
    const parts = [];
    if (r.rerouted.length) parts.push(`${r.rerouted.length} delivery rerouted to ${r.rerouted.map((x) => x.to.name).join(', ')}`);
    if (r.released.length) parts.push(`${r.released.length} reservation(s) released & re-planned`);
    if (r.atRisk.length) parts.push(`${r.atRisk.length} delivery AT RISK — intervention needed`);
    toast(r.atRisk.length ? 'error' : parts.length ? 'warning' : 'success', successTitle, parts.join(' · ') || 'No active deliveries affected');
    return res;
  };
}

export function ShelterEditor({ shelter, onClose }) {
  const update = useShelterUpdate();
  const [demand, setDemand] = useState(() => ({ ...shelter.demand }));
  const [capacity, setCapacity] = useState(String(shelter.capacity));
  const [resources, setResources] = useState(() => ({ ...shelter.resources }));
  const [addCat, setAddCat] = useState('');
  const missing = CATEGORIES.filter((c) => !(c in demand));

  const save = () => {
    const changes = { demand, capacity: Number(capacity), resources };
    const diff = Object.keys(demand)
      .filter((k) => Number(demand[k]) !== shelter.demand[k])
      .map((k) => `${k.toLowerCase()} ${shelter.demand[k] ?? 0} → ${demand[k]}`);
    if (Number(capacity) !== shelter.capacity) diff.push(`capacity ${shelter.capacity} → ${capacity}`);
    for (const k of Object.keys(resources)) if (resources[k] !== shelter.resources[k]) diff.push(`${RESOURCES[k].toLowerCase()} ${resources[k] ? 'available' : 'unavailable'}`);
    const res = update(shelter.id, changes, diff.join(', ') || 'details updated', 'Shelter updated');
    if (res.ok) onClose();
  };

  return (
    <Modal
      title={`Update Shelter ${shelter.code} · ${shelter.name}`}
      icon={<PencilLine size={18} color="var(--brand)" />}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save & recalculate</button></>}
    >
      <div className="callout blue" style={{ marginBottom: 16 }}>
        Saving re-checks every delivery heading here. Cargo that no longer fits is rerouted to a safe shelter or flagged At Risk.
      </div>
      <div className="section-title">Current demand</div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        {Object.keys(demand).map((cat) => (
          <div className="field" key={cat}>
            <label>{cat}</label>
            <input className="input" type="number" min="0" value={demand[cat]} onChange={(e) => setDemand((d) => ({ ...d, [cat]: e.target.value }))} />
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <select className="select" value={addCat} onChange={(e) => setAddCat(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">Accept another category…</option>
            {missing.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-sm" disabled={!addCat} onClick={() => { setDemand((d) => ({ ...d, [addCat]: 0 })); setAddCat(''); }}>Add</button>
        </div>
      )}
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Remaining receiving capacity (units)</label>
          <input className="input" type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
      </div>
      <div className="section-title">Available resources</div>
      <div className="form-grid">
        {Object.entries(RESOURCES).map(([k, label]) => (
          <label className="check" key={k}>
            <input type="checkbox" checked={!!resources[k]} onChange={(e) => setResources((r) => ({ ...r, [k]: e.target.checked }))} />
            {label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function ShelterCard({ shelter }) {
  const { state, confirm } = useApp();
  const update = useShelterUpdate();
  const [editing, setEditing] = useState(false);
  const label = `Shelter ${shelter.code}`;

  const toggleStatus = async () => {
    const closing = shelter.status === 'Open';
    const ok = await confirm({
      title: closing ? `Close ${label}?` : `Reopen ${label}?`,
      message: closing
        ? 'All deliveries heading here will be re-checked. Riders carrying cargo are rerouted to a safe shelter, or flagged At Risk if none exists.'
        : 'The shelter will accept new deliveries again.',
      confirmLabel: closing ? 'Close shelter' : 'Reopen',
      danger: closing,
    });
    if (ok) update(shelter.id, { status: closing ? 'Closed' : 'Open' }, closing ? 'closed by operator' : 'reopened by operator', closing ? `${label} closed` : `${label} reopened`);
  };

  const zeroMeals = async () => {
    const ok = await confirm({
      title: `Set ${label} meal demand to zero?`,
      message: 'Simulates the shelter receiving meals from another source. Riders already heading here with meals will be rerouted.',
      confirmLabel: 'Set demand to 0',
      danger: true,
    });
    if (ok) update(shelter.id, { demand: { ...shelter.demand, 'Cooked meals': 0 } }, 'received another donation; cooked-meal demand is now 0', 'Demand set to zero');
  };

  const inboundTotal = shelterInbound(state, shelter.id, '').total;

  return (
    <div className="card entity" style={shelter.status === 'Closed' ? { opacity: 0.85 } : undefined}>
      <div className="entity-head">
        <div className="dot-icon" style={{ background: shelter.status === 'Open' ? 'var(--green-soft)' : 'var(--red-soft)', color: shelter.status === 'Open' ? 'var(--green)' : 'var(--red)', width: 38, height: 38, borderRadius: 10 }}>
          <Building2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="entity-name">{label} · {shelter.name}</div>
          <div className="entity-meta"><MapPin size={11} /> {shelter.location} · <Clock size={11} /> {shelter.travelMins} min from pickup area</div>
        </div>
        <StatusBadge status={shelter.status} />
      </div>

      <div className="entity-stats">
        <div className="stat-mini"><div className="l">Capacity left</div><div className="v mono">{shelter.capacity}</div></div>
        <div className="stat-mini"><div className="l">Inbound</div><div className="v mono">{inboundTotal}</div></div>
        <div className="stat-mini"><div className="l">Received</div><div className="v mono">{shelter.received}</div></div>
      </div>

      <div>
        <div className="section-title" style={{ marginBottom: 6 }}>Demand (inbound / needed)</div>
        {Object.entries(shelter.demand).map(([cat, d]) => {
          const inb = shelterInbound(state, shelter.id, cat).cat;
          return (
            <div key={cat} style={{ marginBottom: 7 }}>
              <div className="row" style={{ fontSize: 12.5, marginBottom: 3 }}>
                <span>{cat}</span><span className="spacer" />
                <span className="mono"><b>{inb}</b> / {d}</span>
              </div>
              <Progress value={inb} max={d || 1} color={d === 0 ? '#cbd5e1' : inb >= d ? 'var(--green)' : 'var(--blue)'} />
            </div>
          );
        })}
      </div>

      <div className="row wrap" style={{ gap: 5 }}>
        {Object.entries(RESOURCES).map(([k, l]) => (
          <span key={k} className={`chip ${shelter.resources[k] ? 'ok' : 'no'}`}>{l}</span>
        ))}
      </div>

      <div className="entity-actions">
        <button className="btn btn-sm" onClick={() => setEditing(true)}><PencilLine size={14} /> Update demand</button>
        {'Cooked meals' in shelter.demand && shelter.demand['Cooked meals'] > 0 && shelter.status === 'Open' && (
          <button className="btn btn-sm btn-warning" onClick={zeroMeals}><ZapOff size={14} /> Meals demand → 0</button>
        )}
        <button className={`btn btn-sm ${shelter.status === 'Open' ? 'btn-danger' : 'btn-success'}`} onClick={toggleStatus}>
          {shelter.status === 'Open' ? <><DoorClosed size={14} /> Close</> : <><DoorOpen size={14} /> Reopen</>}
        </button>
      </div>
      {editing && <ShelterEditor shelter={shelter} onClose={() => setEditing(false)} />}
    </div>
  );
}
