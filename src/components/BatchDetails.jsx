import { Ban, Package, Pencil, Send } from 'lucide-react';
import { useApp, useAction } from '../context/AppContext.jsx';
import { describeRules } from '../services/compatibilityService.js';
import { batchBlockReason, getRider, getShelter, remainingMins } from '../services/dispatchEngine.js';
import { cancelBatch } from '../services/reservationService.js';
import { formatDateTime, formatDuration } from '../utils/timeUtils.js';
import { Modal, QuantityBar, StatusBadge } from './ui.jsx';

export default function BatchDetails({ batchId, onClose, onEdit }) {
  const { state, now, navigate, confirm } = useApp();
  const act = useAction();
  const b = state.batches.find((x) => x.id === batchId);
  if (!b) return null;
  const block = batchBlockReason(b, now);
  const rem = remainingMins(b, now);
  const assignments = state.assignments.filter((a) => a.batchId === b.id);
  const rules = describeRules(b);

  const doCancel = async () => {
    const ok = await confirm({
      title: `Cancel ${b.id}?`,
      message: 'Uncollected reservations will be released and the remaining quantity withdrawn. Cargo already with riders must be delivered or rerouted first.',
      confirmLabel: 'Cancel batch',
      danger: true,
    });
    if (ok) act((s, t) => cancelBatch(s, t, b.id), { success: 'Batch cancelled', successMsg: b.id });
  };

  return (
    <Modal
      size="wide"
      title={`${b.id} · ${b.donor}`}
      icon={<Package size={18} color="var(--brand)" />}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={doCancel} disabled={b.cancelled}><Ban size={14} /> Cancel batch</button>
          <span className="spacer" />
          <button className="btn" onClick={() => { onClose(); onEdit?.(b); }} disabled={b.cancelled || !onEdit}><Pencil size={14} /> Edit</button>
          <button className="btn btn-primary" disabled={!!block} title={block ?? ''} onClick={() => { onClose(); navigate('dispatch', { batchId: b.id }); }}>
            <Send size={14} /> Plan dispatch
          </button>
        </>
      }
    >
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <StatusBadge status={b.status} />
        <span className="badge b-gray">{b.category}</span>
        {!b.cancelled && b.status !== 'Delivered' && (
          <span className={`badge ${rem <= 60 ? 'b-red' : rem <= 180 ? 'b-orange' : 'b-green'}`}>
            {rem > 0 ? `${formatDuration(rem)} shelf-life left` : 'Expired'}
          </span>
        )}
      </div>
      {block && b.status !== 'Delivered' && <div className="callout orange" style={{ marginBottom: 14 }}>{block}</div>}

      <div className="section-title">Quantity tracking</div>
      <QuantityBar batch={b} legend />
      <div className="divider" />

      <dl className="kv">
        <dt>Description</dt><dd>{b.description || '—'}</dd>
        <dt>Quantity</dt><dd>{b.quantity} {b.unit}</dd>
        <dt>Pickup location</dt><dd>{b.pickupLocation}</dd>
        <dt>Prepared / created</dt><dd>{formatDateTime(b.preparedAt)}</dd>
        <dt>Expires</dt><dd>{formatDateTime(b.expiresAt)}</dd>
        <dt>Pickup duration</dt><dd>{b.pickupMins} min</dd>
        <dt>Delivery estimate</dt><dd>{b.deliveryMins} min</dd>
        <dt>Storage</dt><dd>{b.storage}</dd>
        <dt>Special handling</dt><dd>{b.handling}</dd>
      </dl>

      {rules.length > 0 && (
        <>
          <div className="divider" />
          <div className="section-title">Safety & compatibility rules</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} className="muted">
            {rules.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </>
      )}

      <div className="divider" />
      <div className="section-title">Assignments ({assignments.length})</div>
      {assignments.length === 0 ? (
        <p className="subtle">No riders assigned yet.</p>
      ) : (
        <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
          <table className="table">
            <thead><tr><th>ID</th><th>Rider</th><th>Shelter</th><th>Qty</th><th>Status</th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.id}<div className="cell-sub">{a.reservationId}</div></td>
                  <td>{getRider(state, a.riderId)?.name}</td>
                  <td>Shelter {getShelter(state, a.shelterId)?.code}</td>
                  <td className="mono">{a.qty}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
