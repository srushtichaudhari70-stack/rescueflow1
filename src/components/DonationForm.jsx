import { PackagePlus, Pencil } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, DEFAULT_UNITS, DONORS, STORAGE_OPTIONS } from '../data/constants.js';
import { useApp } from '../context/AppContext.jsx';
import { createBatch, updateBatch, validateBatchForm } from '../services/reservationService.js';
import { fromLocalInput, MINUTE, toLocalInput } from '../utils/timeUtils.js';
import { Modal } from './ui.jsx';

function initialForm(batch, nextIdPreview) {
  const now = Date.now();
  if (batch) {
    return {
      id: batch.id,
      donor: batch.donor,
      category: batch.category,
      description: batch.description,
      quantity: String(batch.quantity),
      unit: batch.unit,
      pickupLocation: batch.pickupLocation,
      preparedAt: toLocalInput(batch.preparedAt),
      expiresAt: toLocalInput(batch.expiresAt),
      pickupMins: String(batch.pickupMins),
      deliveryMins: String(batch.deliveryMins),
      storage: batch.storage,
      handling: batch.handling,
    };
  }
  return {
    id: nextIdPreview,
    donor: DONORS[0],
    category: 'Cooked meals',
    description: '',
    quantity: '60',
    unit: 'meals',
    pickupLocation: '',
    preparedAt: toLocalInput(now - 30 * MINUTE),
    expiresAt: toLocalInput(now + 3 * 60 * MINUTE),
    pickupMins: '10',
    deliveryMins: '25',
    storage: STORAGE_OPTIONS[1],
    handling: '',
  };
}

export default function DonationForm({ batch, onClose }) {
  const { state, run, toast } = useApp();
  const [form, setForm] = useState(() => initialForm(batch, `B-${(state.counters.batch ?? 1000) + 1}`));
  const [errors, setErrors] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onCategory = (e) => {
    const category = e.target.value;
    setForm((f) => ({
      ...f,
      category,
      unit: DEFAULT_UNITS[category],
      storage: category === 'Cooked meals' ? STORAGE_OPTIONS[1] : category === 'Medical supplies' ? f.storage : 'Cool & dry',
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      preparedAt: fromLocalInput(form.preparedAt),
      expiresAt: fromLocalInput(form.expiresAt),
    };
    const pre = validateBatchForm(payload, Date.now(), batch);
    if (pre.length) {
      setErrors(pre);
      return;
    }
    const res = run((s, now) => (batch ? updateBatch(s, now, batch.id, payload) : createBatch(s, now, payload)));
    if (!res.ok) {
      setErrors(res.reasons ?? [res.reason]);
      return;
    }
    toast('success', batch ? 'Donation updated' : 'Donation created', `${res.batch.id} · ${res.batch.quantity} ${res.batch.unit} from ${res.batch.donor}`);
    onClose();
  };

  return (
    <Modal
      size="wide"
      title={batch ? `Edit donation ${batch.id}` : 'New donation batch'}
      icon={batch ? <Pencil size={18} color="var(--brand)" /> : <PackagePlus size={18} color="var(--brand)" />}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="donation-form">{batch ? 'Save changes' : 'Create donation'}</button>
        </>
      }
    >
      {errors.length > 0 && (
        <div className="form-errors">
          <b>Please fix the following:</b>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}
      <form id="donation-form" className="form-grid" onSubmit={submit}>
        <div className="field">
          <label>Batch ID</label>
          <input className="input mono" value={form.id} readOnly />
          <span className="hint">Generated automatically and never reused</span>
        </div>
        <div className="field">
          <label>Donor name</label>
          <input className="input" list="donor-list" value={form.donor} onChange={set('donor')} required />
          <datalist id="donor-list">{DONORS.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
        <div className="field">
          <label>Aid category</label>
          <select className="select" value={form.category} onChange={onCategory}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" min="1" step="1" value={form.quantity} onChange={set('quantity')} required />
          </div>
          <div className="field">
            <label>Unit</label>
            <input className="input" value={form.unit} onChange={set('unit')} required />
          </div>
        </div>
        <div className="field full">
          <label>Description</label>
          <input className="input" value={form.description} onChange={set('description')} placeholder="e.g. Veg biryani and dal from lunch service" />
        </div>
        <div className="field full">
          <label>Pickup location</label>
          <input className="input" value={form.pickupLocation} onChange={set('pickupLocation')} placeholder="e.g. Sunrise Banquet Hall, Ring Road" required />
        </div>
        <div className="field">
          <label>{form.category === 'Cooked meals' ? 'Food preparation time' : 'Supply creation time'}</label>
          <input className="input" type="datetime-local" value={form.preparedAt} onChange={set('preparedAt')} />
        </div>
        <div className="field">
          <label>Expiry time</label>
          <input className="input" type="datetime-local" value={form.expiresAt} onChange={set('expiresAt')} required />
        </div>
        <div className="field">
          <label>Estimated pickup duration (min)</label>
          <input className="input" type="number" min="0" value={form.pickupMins} onChange={set('pickupMins')} />
          <span className="hint">Time to load at the donor</span>
        </div>
        <div className="field">
          <label>Estimated delivery duration (min)</label>
          <input className="input" type="number" min="0" value={form.deliveryMins} onChange={set('deliveryMins')} />
          <span className="hint">Donor's estimate; the engine uses real shelter travel times</span>
        </div>
        <div className="field">
          <label>Required storage conditions</label>
          <select className="select" value={form.storage} onChange={set('storage')}>
            {STORAGE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Special handling requirements</label>
          <input className="input" value={form.handling} onChange={set('handling')} placeholder="e.g. Contains nuts, keep upright" />
        </div>
      </form>
    </Modal>
  );
}
