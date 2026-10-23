import { Eye, Pencil, Send } from 'lucide-react';
import { batchBlockReason, remainingMins } from '../services/dispatchEngine.js';
import { formatDuration } from '../utils/timeUtils.js';
import { QuantityBar, StatusBadge } from './ui.jsx';

export function ShelfLife({ batch, now }) {
  if (batch.status === 'Delivered' || batch.cancelled) return <span className="subtle">—</span>;
  const rem = remainingMins(batch, now);
  let color = 'var(--text)';
  if (rem <= 0) color = 'var(--red)';
  else if (rem <= 60) color = 'var(--red)';
  else if (rem <= 180) color = 'var(--orange)';
  return (
    <span className="mono strong nowrap" style={{ color }}>
      {rem <= 0 ? 'Expired' : formatDuration(rem)}
    </span>
  );
}

export default function DonationTable({ batches, now, onView, onEdit, onDispatch, compact = false, selectedId }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Batch</th>
            {!compact && <th>Category</th>}
            <th style={{ minWidth: 150 }}>Quantity</th>
            <th>Shelf-life</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => {
            const block = batchBlockReason(b, now);
            return (
              <tr key={b.id} className={selectedId === b.id ? 'selected' : ''}>
                <td>
                  <div className="cell-title">{b.id}</div>
                  <div className="cell-sub">{compact ? `${b.category} · ${b.donor}` : b.donor}</div>
                </td>
                {!compact && (
                  <td>
                    <div>{b.category}</div>
                    <div className="cell-sub">{b.storage}</div>
                  </td>
                )}
                <td>
                  <div className="mono" style={{ fontSize: 12.5, marginBottom: 5 }}>
                    <b>{b.qty.available}</b> <span className="muted">of {b.quantity} {b.unit} available</span>
                  </div>
                  <QuantityBar batch={b} />
                </td>
                <td><ShelfLife batch={b} now={now} /></td>
                <td><StatusBadge status={b.status} /></td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-xs" onClick={() => onView(b)} title="View batch details">
                      <Eye size={13} /> {!compact && 'View'}
                    </button>
                    {onEdit && !compact && (
                      <button className="btn btn-xs" onClick={() => onEdit(b)} disabled={b.cancelled} title="Edit donation">
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    {onDispatch && (
                      <button className="btn btn-xs btn-primary" onClick={() => onDispatch(b)} disabled={!!block} title={block ?? 'Plan dispatch for this batch'}>
                        <Send size={13} /> Dispatch
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
