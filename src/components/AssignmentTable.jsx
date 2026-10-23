import { CheckCheck, Flag, PackageCheck, RefreshCw, Timer, Trash2, Truck, XCircle } from 'lucide-react';
import { useApp, useAction } from '../context/AppContext.jsx';
import { getRider, getShelter, shelterLabel } from '../services/dispatchEngine.js';
import {
  acknowledge,
  cancelAssignment,
  completeDelivery,
  completePickup,
  resolveAtRisk,
  startDelivery,
  timeoutReservation,
} from '../services/reservationService.js';
import { formatDuration } from '../utils/timeUtils.js';
import { Empty, LifecycleStepper, StatusBadge } from './ui.jsx';

export function AckCountdown({ a, now }) {
  if (a.status !== 'Awaiting Ack') return null;
  const secs = Math.max(0, Math.round((a.ackDeadline - now) / 1000));
  return (
    <span className={`badge ${secs <= 30 ? 'b-red' : 'b-orange'} mono`} title="Time left for the rider to acknowledge">
      <Timer size={12} /> {secs}s
    </span>
  );
}

export function AssignmentActions({ a }) {
  const { state, confirm, toast, run } = useApp();
  const act = useAction();
  const rider = getRider(state, a.riderId);

  const doTimeout = async () => {
    const ok = await confirm({
      title: 'Simulate rider timeout?',
      message: `${rider.name} will be treated as unresponsive. The reserved ${a.qty} ${a.unit} will be released (only because they were not collected) and the engine will look for another rider.`,
      confirmLabel: 'Simulate timeout',
      danger: true,
    });
    if (!ok) return;
    const res = run((s, now) => timeoutReservation(s, now, a.id, { manual: true }));
    if (!res.ok) return toast('error', 'Timeout blocked', res.reason);
    const names = res.reassigned.map((x) => `${x.qty} → ${state.riders.find((r) => r.id === x.riderId)?.name}`).join(', ');
    toast(res.reassigned.length ? 'warning' : 'error', 'Reservation recovered', `${res.released} ${a.unit} released. ${res.reassigned.length ? `Reassigned: ${names}.` : `Not reassigned: ${res.reason}`}`);
  };

  const doCancel = async () => {
    const ok = await confirm({ title: 'Cancel this assignment?', message: `${a.qty} ${a.unit} will go back to available stock and ${rider.name} will be freed.`, confirmLabel: 'Cancel assignment', danger: true });
    if (ok) act((s, now) => cancelAssignment(s, now, a.id), { success: 'Assignment cancelled', successMsg: `${a.qty} ${a.unit} returned to stock` });
  };

  const doDispose = async () => {
    const ok = await confirm({ title: 'Record safe disposal?', message: `${a.qty} ${a.unit} will be recorded as spoiled and NOT delivered. Use this only when no safe destination exists.`, confirmLabel: 'Dispose safely', danger: true });
    if (ok) act((s, now) => resolveAtRisk(s, now, a.id, 'dispose'), { success: 'Cargo disposed', successMsg: 'Recorded for food-safety audit; rider released' });
  };

  switch (a.status) {
    case 'Awaiting Ack':
      return (
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-xs btn-success"
            disabled={rider.ghost}
            title={rider.ghost ? 'This rider is simulated as unresponsive' : 'Rider confirms the job'}
            onClick={() => act((s, now) => acknowledge(s, now, a.id), { success: 'Acknowledged', successMsg: `${rider.name} accepted ${a.reservationId}` })}
          >
            <CheckCheck size={13} /> Acknowledge
          </button>
          <button className="btn btn-xs btn-warning" onClick={doTimeout}><Timer size={13} /> Simulate timeout</button>
          <button className="btn btn-xs btn-ghost" onClick={doCancel} title="Cancel assignment"><XCircle size={13} /></button>
        </div>
      );
    case 'Acknowledged':
      return (
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-xs btn-primary" onClick={() => act((s, now) => completePickup(s, now, a.id), { success: 'Pickup completed', successMsg: `${a.qty} ${a.unit} collected` })}>
            <PackageCheck size={13} /> Complete pickup
          </button>
          <button className="btn btn-xs btn-warning" onClick={doTimeout} title="Rider did not show up"><Timer size={13} /> No-show</button>
          <button className="btn btn-xs btn-ghost" onClick={doCancel} title="Cancel assignment"><XCircle size={13} /></button>
        </div>
      );
    case 'Picked Up':
      return (
        <button
          className="btn btn-xs btn-primary"
          onClick={() => act((s, now) => startDelivery(s, now, a.id), { success: 'Delivery started', successMsg: `${rider.name} is on the way` })}
        >
          <Truck size={13} /> Start delivery
        </button>
      );
    case 'In Transit':
      return (
        <button
          className="btn btn-xs btn-success"
          onClick={() => act((s, now) => completeDelivery(s, now, a.id), { success: 'Delivered', successMsg: `${a.qty} ${a.unit} rescued`, errorTitle: 'Delivery blocked' })}
        >
          <Flag size={13} /> Complete delivery
        </button>
      );
    case 'At Risk':
      return (
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          {!a.expiredCargo && (
            <button className="btn btn-xs btn-warning" onClick={() => act((s, now) => resolveAtRisk(s, now, a.id, 'retry'), { success: 'Safe destination found', successMsg: (r) => `Rerouted to ${r.to.name}`, errorTitle: 'Still no safe destination' })}>
              <RefreshCw size={13} /> Retry reroute
            </button>
          )}
          <button className="btn btn-xs btn-danger" onClick={doDispose}><Trash2 size={13} /> Dispose safely</button>
        </div>
      );
    default:
      return null;
  }
}

export default function AssignmentTable({ assignments, now, emptyText = 'No active deliveries' }) {
  const { state } = useApp();
  if (!assignments.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Rider</th>
            <th>Destination</th>
            <th>Cargo</th>
            <th>Progress</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const rider = getRider(state, a.riderId);
            const shelter = getShelter(state, a.shelterId);
            const from = a.reroutedFrom ? getShelter(state, a.reroutedFrom) : null;
            const eta = (a.etaAt - now) / 60000;
            return (
              <tr key={a.id}>
                <td>
                  <div className="cell-title">{a.id}</div>
                  <div className="cell-sub mono">{a.reservationId} · {a.batchId}</div>
                </td>
                <td>
                  <div className="strong">{rider?.name}</div>
                  <div className="cell-sub">{rider?.vehicle} · cap {rider?.capacity}{rider?.ghost ? ' · unresponsive (sim)' : ''}</div>
                </td>
                <td>
                  <div>{shelterLabel(shelter)}</div>
                  {from && <div className="cell-sub" style={{ color: 'var(--orange)' }}>Rerouted from Shelter {from.code}</div>}
                </td>
                <td className="mono nowrap"><b>{a.qty}</b> {a.unit}</td>
                <td>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <StatusBadge status={a.status} />
                    <AckCountdown a={a} now={now} />
                    {a.status === 'In Transit' && <span className="cell-sub mono">ETA {eta > 0 ? formatDuration(eta) : 'arriving'}</span>}
                  </div>
                  <div style={{ marginTop: 6 }}><LifecycleStepper status={a.status} /></div>
                </td>
                <td style={{ textAlign: 'right' }}><AssignmentActions a={a} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
