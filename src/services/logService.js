// Activity log + alert helpers. They mutate the draft state passed in.
import { nextId } from '../utils/idUtils.js';

const MAX_LOGS = 400;

export function addLog(state, now, { type, description, batchId = null, riderId = null, status = 'info' }) {
  state.logs.unshift({
    id: nextId(state, 'log', 'LOG'),
    ts: now,
    type,
    description,
    batchId,
    riderId,
    status, // success | info | warning | danger
  });
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
}

// Alerts need operator attention (shown in the bell + alert panels).
export function addAlert(state, now, { kind, severity = 'danger', title, message, assignmentId = null, batchId = null, actions = [] }) {
  const existing = state.alerts.find(
    (a) => !a.resolved && a.kind === kind && a.assignmentId === assignmentId && a.batchId === batchId,
  );
  if (existing) {
    Object.assign(existing, { title, message, actions, ts: now, severity });
    return existing;
  }
  const alert = {
    id: nextId(state, 'alert', 'ALR'),
    ts: now,
    kind,
    severity,
    title,
    message,
    assignmentId,
    batchId,
    actions,
    resolved: false,
  };
  state.alerts.unshift(alert);
  return alert;
}

export function resolveAlerts(state, predicate, now) {
  for (const a of state.alerts) {
    if (!a.resolved && predicate(a)) {
      a.resolved = true;
      a.resolvedAt = now;
    }
  }
}
