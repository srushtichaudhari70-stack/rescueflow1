import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import RiderCard from '../components/RiderCard.jsx';
import { Modal } from '../components/ui.jsx';
import { addRider } from '../services/reservationService.js';

const FILTERS = ['All', 'Available', 'Awaiting Ack', 'Assigned', 'Carrying', 'Unresponsive', 'Off Duty'];

function AddRiderModal({ onClose }) {
  const { run, toast } = useApp();
  const [form, setForm] = useState({ name: '', vehicle: 'Scooter', zone: 'Central', capacity: '40', travelMins: '10', reliability: '85' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = () => {
    const res = run((s, now) => addRider(s, now, form));
    if (!res.ok) return setError(res.reason);
    toast('success', 'Rider added', `${res.rider.name} (${res.rider.id}) is available`);
    onClose();
  };
  return (
    <Modal
      title="Add volunteer rider"
      icon={<UserPlus size={18} color="var(--brand)" />}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Add rider</button></>}
    >
      {error && <div className="form-errors">{error}</div>}
      <div className="form-grid">
        <div className="field full"><label>Name</label><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Neha Patil" autoFocus /></div>
        <div className="field">
          <label>Vehicle</label>
          <select className="select" value={form.vehicle} onChange={set('vehicle')}>
            {['Bicycle + trailer', 'Scooter', 'Motorbike', 'Auto-rickshaw', 'Cargo van'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>Zone</label><input className="input" value={form.zone} onChange={set('zone')} /></div>
        <div className="field"><label>Max carrying capacity (units)</label><input className="input" type="number" min="1" value={form.capacity} onChange={set('capacity')} /></div>
        <div className="field"><label>Travel time to pickup (min)</label><input className="input" type="number" min="0" value={form.travelMins} onChange={set('travelMins')} /></div>
        <div className="field"><label>Reliability score (0–100)</label><input className="input" type="number" min="0" max="100" value={form.reliability} onChange={set('reliability')} /></div>
      </div>
    </Modal>
  );
}

export default function Riders() {
  const { state } = useApp();
  const [filter, setFilter] = useState('All');
  const [adding, setAdding] = useState(false);
  const riders = state.riders.filter((r) => filter === 'All' || r.status === filter);
  const totalCap = state.riders.filter((r) => r.status === 'Available').reduce((n, r) => n + r.capacity - r.load, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Riders</h1>
          <p>Volunteer riders ranked by reliability. A rider who misses an acknowledgment deadline is marked unresponsive and never re-offered that batch. {totalCap} units of free capacity right now.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={15} /> Add rider</button>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f} <span className="mono" style={{ opacity: 0.6 }}>{f === 'All' ? state.riders.length : state.riders.filter((r) => r.status === f).length}</span>
          </button>
        ))}
      </div>
      <div className="entity-grid">
        {riders.map((r) => <RiderCard key={r.id} rider={r} />)}
      </div>
      {riders.length === 0 && <div className="card"><div className="empty">No riders with this status</div></div>}
      {adding && <AddRiderModal onClose={() => setAdding(false)} />}
    </div>
  );
}
