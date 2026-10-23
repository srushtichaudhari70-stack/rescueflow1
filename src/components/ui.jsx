// Small shared UI building blocks: badges, modal, quantity bar, empty state.
import { X } from 'lucide-react';
import { useEffect } from 'react';

const STATUS_COLORS = {
  // batches
  Available: 'b-navy',
  Reserved: 'b-violet',
  Assigned: 'b-violet',
  'In Transit': 'b-blue',
  Delivered: 'b-green',
  Expired: 'b-red',
  Cancelled: 'b-gray',
  // assignments
  'Awaiting Ack': 'b-orange',
  Acknowledged: 'b-violet',
  'Picked Up': 'b-blue',
  'Timed Out': 'b-red',
  'At Risk': 'b-red',
  Disposed: 'b-gray',
  // riders
  Carrying: 'b-blue',
  Unresponsive: 'b-red',
  'Off Duty': 'b-gray',
  // shelters
  Open: 'b-green',
  Closed: 'b-red',
  // log levels
  success: 'b-green',
  info: 'b-blue',
  warning: 'b-orange',
  danger: 'b-red',
  // priority
  Critical: 'b-red',
  High: 'b-orange',
  Medium: 'b-blue',
  Low: 'b-gray',
};

const LABELS = { 'Awaiting Ack': 'Awaiting ack', success: 'Success', info: 'Info', warning: 'Warning', danger: 'Critical' };

export function StatusBadge({ status, dot = true }) {
  return <span className={`badge ${dot ? 'badge-dot' : ''} ${STATUS_COLORS[status] ?? 'b-gray'}`}>{LABELS[status] ?? status}</span>;
}

export function Modal({ title, icon, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon}
          <h2>{title}</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const Q_COLORS = {
  delivered: '#15803d',
  collected: '#2563eb',
  reserved: '#8b5cf6',
  available: '#94a3b8',
  spoiled: '#dc2626',
};
const Q_LABELS = { delivered: 'Delivered', collected: 'Collected', reserved: 'Reserved', available: 'Available', spoiled: 'Spoiled' };

export function QuantityBar({ batch, legend = false }) {
  const total = batch.quantity || 1;
  const keys = ['delivered', 'collected', 'reserved', 'available', 'spoiled'];
  return (
    <div>
      <div className="qbar" title={keys.map((k) => `${Q_LABELS[k]}: ${batch.qty[k]}`).join(' · ')}>
        {keys.map((k) => (batch.qty[k] > 0 ? <span key={k} style={{ width: `${(batch.qty[k] / total) * 100}%`, background: Q_COLORS[k] }} /> : null))}
      </div>
      {legend && (
        <div className="legend">
          {keys.map((k) => (
            <span key={k}>
              <i style={{ background: Q_COLORS[k] }} />
              {Q_LABELS[k]} <b className="mono">{batch.qty[k]}</b>
            </span>
          ))}
          {batch.cancelledQty > 0 && <span>Withdrawn <b className="mono">{batch.cancelledQty}</b></span>}
        </div>
      )}
    </div>
  );
}

export function Progress({ value, max, color = 'var(--brand)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress">
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon, children }) {
  return (
    <div className="empty">
      {icon && <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      {children}
    </div>
  );
}

const STEPS = ['Awaiting Ack', 'Acknowledged', 'Picked Up', 'In Transit', 'Delivered'];
export function LifecycleStepper({ status }) {
  const idx = STEPS.indexOf(status);
  const risk = status === 'At Risk';
  return (
    <div className="stepper" title={status}>
      {STEPS.map((s, i) => {
        let cls = '';
        if (risk) cls = i <= 3 ? 'risk' : '';
        else if (status === 'Delivered' || i < idx) cls = 'done';
        else if (i === idx) cls = 'now';
        return <span key={s} className={`s ${cls}`} />;
      })}
    </div>
  );
}
