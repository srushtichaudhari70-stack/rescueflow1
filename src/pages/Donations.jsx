import { PackagePlus, Search } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import DonationTable from '../components/DonationTable.jsx';
import DonationForm from '../components/DonationForm.jsx';
import BatchDetails from '../components/BatchDetails.jsx';
import { Empty } from '../components/ui.jsx';
import { CATEGORIES } from '../data/constants.js';

const STATUSES = ['Available', 'Reserved', 'Assigned', 'In Transit', 'Delivered', 'Expired', 'Cancelled'];

export default function Donations() {
  const { state, now, navigate } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [viewId, setViewId] = useState(null);

  const term = q.trim().toLowerCase();
  const rows = state.batches.filter(
    (b) =>
      (!status || b.status === status) &&
      (!category || b.category === category) &&
      (!term || `${b.id} ${b.donor} ${b.description} ${b.pickupLocation}`.toLowerCase().includes(term)),
  );
  const counts = STATUSES.map((s) => [s, state.batches.filter((b) => b.status === s).length]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Donations</h1>
          <p>Every donation batch with live quantity tracking: available, reserved, collected, delivered and spoiled units always add up to the original quantity.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><PackagePlus size={15} /> New donation</button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        {counts.map(([s, n]) => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : ''}`} onClick={() => setStatus(status === s ? '' : s)}>
            {s} <span className="mono" style={{ opacity: 0.7 }}>{n}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="filters">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--subtle)' }} />
            <input className="input" style={{ paddingLeft: 30, minWidth: 260 }} placeholder="Search batch, donor or location" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span className="subtle" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{rows.length} of {state.batches.length} batches</span>
        </div>
        {rows.length ? (
          <DonationTable batches={rows} now={now} onView={(b) => setViewId(b.id)} onEdit={(b) => setEditBatch(b)} onDispatch={(b) => navigate('dispatch', { batchId: b.id })} />
        ) : (
          <Empty>No batches match these filters</Empty>
        )}
      </div>

      {showForm && <DonationForm onClose={() => setShowForm(false)} />}
      {editBatch && <DonationForm batch={editBatch} onClose={() => setEditBatch(null)} />}
      {viewId && <BatchDetails batchId={viewId} onClose={() => setViewId(null)} onEdit={(b) => setEditBatch(b)} />}
    </div>
  );
}
