import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { Modal } from './ui.jsx';

const ICONS = {
  success: <CheckCircle2 size={18} color="var(--green)" />,
  warning: <AlertTriangle size={18} color="#e08a1e" />,
  error: <XCircle size={18} color="var(--red)" />,
  info: <Info size={18} color="var(--blue)" />,
};

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {ICONS[t.type] ?? ICONS.info}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const { confirmState, closeConfirm } = useApp();
  if (!confirmState) return null;
  return (
    <Modal
      size="narrow"
      title={confirmState.title}
      icon={<AlertTriangle size={18} color={confirmState.danger ? 'var(--red)' : 'var(--orange)'} />}
      onClose={() => closeConfirm(false)}
      footer={
        <>
          <button className="btn" onClick={() => closeConfirm(false)}>Cancel</button>
          <button className={`btn ${confirmState.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => closeConfirm(true)} autoFocus>
            {confirmState.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      <p className="muted">{confirmState.message}</p>
    </Modal>
  );
}
