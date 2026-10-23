import { AlertOctagon, CheckCircle2, ChevronDown, ChevronRight, ListOrdered, Route, Settings2, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useAction } from '../context/AppContext.jsx';
import AssignmentTable from '../components/AssignmentTable.jsx';
import { ShelfLife } from '../components/DonationTable.jsx';
import { Empty, Modal, QuantityBar, StatusBadge } from '../components/ui.jsx';
import {
  ACTIVE_STATUSES,
  getBatch,
  rankBatches,
  remainingMins,
  scoreBatch,
  shelterLabel,
  validateAssignment,
} from '../services/dispatchEngine.js';
import { checkIntegrity, createAssignment, dispatchBatch, updateSettings } from '../services/reservationService.js';
import { formatDuration } from '../utils/timeUtils.js';

function scoreColor(total) {
  if (total >= 75) return ['var(--red-soft)', 'var(--red)'];
  if (total >= 55) return ['var(--orange-soft)', 'var(--orange)'];
  if (total >= 35) return ['var(--blue-soft)', 'var(--blue)'];
  return ['#eef1f5', 'var(--muted)'];
}

function SettingsModal({ onClose }) {
  const { state, run, toast } = useApp();
  const [f, setF] = useState({ ...state.settings });
  const [err, setErr] = useState('');
  const save = () => {
    const res = run((s, now) => updateSettings(s, now, f));
    if (!res.ok) return setErr(res.reason);
    toast('success', 'Dispatch rules updated', `Safety buffer ${f.safetyBufferMins} min · ack timeout ${f.ackTimeoutSecs}s`);
    onClose();
  };
  return (
    <Modal title="Dispatch rules" icon={<Settings2 size={18} color="var(--brand)" />} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save rules</button></>}>
      {err && <div className="form-errors">{err}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Safety buffer (minutes)</label>
          <input className="input" type="number" value={f.safetyBufferMins} onChange={(e) => setF({ ...f, safetyBufferMins: e.target.value })} />
          <span className="hint">Food must arrive at least this long before expiry</span>
        </div>
        <div className="field">
          <label>Acknowledgment timeout (seconds)</label>
          <input className="input" type="number" value={f.ackTimeoutSecs} onChange={(e) => setF({ ...f, ackTimeoutSecs: e.target.value })} />
          <span className="hint">Unanswered reservations are recovered after this</span>
        </div>
        <div className="field">
          <label>Handover time at shelter (minutes)</label>
          <input className="input" type="number" value={f.handlingMins} onChange={(e) => setF({ ...f, handlingMins: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

function Rejections({ title, items }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} style={{ paddingLeft: 4 }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title} ({items.length})
      </button>
      {open && (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6 }}>
          {items.map((r) => (
            <div key={r.id} className="list-item" style={{ padding: '8px 12px' }}>
              <XCircle size={14} color="var(--red)" style={{ marginTop: 3, flexShrink: 0 }} />
              <div style={{ fontSize: 12.5 }}>
                <b>{r.name}</b>
                <div className="muted">{r.reasons.join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualAssign({ batch }) {
  const { state, now } = useApp();
  const act = useAction();
  const [riderId, setRiderId] = useState('');
  const [shelterId, setShelterId] = useState('');
  const [qty, setQty] = useState('');
  const n = Number(qty);
  const v = riderId && shelterId && qty ? validateAssignment(state, { batchId: batch.id, riderId, shelterId, qty: n }, now) : null;

  const submit = () => {
    const res = act((s, t) => createAssignment(s, t, { batchId: batch.id, riderId, shelterId, qty: n }, { reason: 'manual' }), {
      success: 'Rider assigned',
      successMsg: (r) => `${r.assignment.reservationId}: ${n} ${batch.unit} reserved, awaiting acknowledgment`,
      errorTitle: 'Assignment rejected',
    });
    if (res.ok) setQty('');
  };

  return (
    <div>
      <div className="section-title" style={{ marginTop: 6 }}>Manual assignment</div>
      <div className="row wrap">
        <select className="select" style={{ flex: '1 1 160px' }} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
          <option value="">Choose rider…</option>
          {state.riders.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status} · cap {r.capacity - r.load}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 160px' }} value={shelterId} onChange={(e) => setShelterId(e.target.value)}>
          <option value="">Choose shelter…</option>
          {state.shelters.map((sh) => <option key={sh.id} value={sh.id}>Shelter {sh.code} · {sh.name}</option>)}
        </select>
        <input className="input" style={{ width: 90 }} type="number" min="1" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="btn btn-primary" disabled={!v} onClick={submit}><UserPlus size={14} /> Assign rider</button>
      </div>
      {v && (
        <div className={`callout ${v.ok ? 'green' : 'red'}`} style={{ marginTop: 10 }}>
          {v.ok ? <CheckCircle2 size={16} /> : <AlertOctagon size={16} />}
          <div>
            {v.ok ? (
              <>Safe: arrives in {v.trip.total} min with {Math.floor(v.exp.slack)} min to spare before the safe deadline.</>
            ) : (
              <>
                <b>This assignment will be rejected:</b>
                <ul>{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DispatchCenter() {
  const { state, now, route, confirm } = useApp();
  const act = useAction();
  const [selectedId, setSelectedId] = useState(route.params.batchId ?? null);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState('active');

  useEffect(() => {
    if (route.params.batchId) setSelectedId(route.params.batchId);
  }, [route.params.batchId]);

  const ranking = useMemo(() => rankBatches(state, now), [state, now]);
  const effectiveId = selectedId && getBatch(state, selectedId) ? selectedId : ranking[0]?.batch.id;
  const batch = effectiveId ? getBatch(state, effectiveId) : null;
  const score = useMemo(() => (batch ? scoreBatch(state, batch, now) : null), [state, batch, now]);
  const plan = score?.plan;
  const integrity = useMemo(() => checkIntegrity(state), [state]);

  const active = state.assignments.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const history = state.assignments.filter((a) => !ACTIVE_STATUSES.includes(a.status)).sort((a, b) => (b.closedAt ?? b.deliveredAt ?? b.createdAt) - (a.closedAt ?? a.deliveredAt ?? a.createdAt)).slice(0, 15);

  const confirmDispatch = async () => {
    const ok = await confirm({
      title: `Dispatch ${batch.id}?`,
      message: `This creates ${plan.allocations.length} reservation(s) for ${plan.totalAllocated} ${batch.unit}. Each rider must acknowledge within ${state.settings.ackTimeoutSecs}s or the stock is recovered automatically.`,
      confirmLabel: 'Create reservations',
    });
    if (!ok) return;
    act((s, t) => dispatchBatch(s, t, batch.id), {
      success: 'Dispatch created',
      successMsg: (r) => `${r.created.length} riders reserved: ${r.created.map((a) => a.qty).join(' + ')} ${batch.unit}`,
      errorTitle: 'Dispatch blocked',
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dispatch Center</h1>
          <p>The engine ranks batches with a transparent score, then splits each batch across riders and shelters — only where expiry, capacity, demand and compatibility all allow it.</p>
        </div>
        <div className="page-actions">
          <span className="badge b-gray" style={{ height: 30, padding: '0 12px' }}>Buffer {state.settings.safetyBufferMins} min · Ack {state.settings.ackTimeoutSecs}s</span>
          <button className="btn" onClick={() => setShowSettings(true)}><Settings2 size={15} /> Dispatch rules</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.5fr)', marginBottom: 18 }} id="dispatch-grid">
        <div className="card">
          <div className="card-head">
            <ListOrdered size={16} color="var(--brand)" />
            <h3>Priority queue</h3>
            <span className="sub">{ranking.length} dispatchable</span>
          </div>
          {ranking.length === 0 && <Empty>No batches waiting for dispatch</Empty>}
          <div className="list">
            {ranking.map(({ batch: b, score: sc }, i) => {
              const [bg, fg] = scoreColor(sc.total);
              return (
                <button
                  key={b.id}
                  className="list-item"
                  onClick={() => setSelectedId(b.id)}
                  style={{ border: 0, borderBottom: '1px solid var(--border)', background: b.id === effectiveId ? 'var(--brand-soft)' : 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', alignItems: 'center' }}
                >
                  <span className="subtle mono" style={{ width: 16 }}>{i + 1}</span>
                  <span className="score-ring mono" style={{ background: bg, color: fg }}>{sc.total}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row"><b>{b.id}</b><StatusBadge status={sc.level} dot={false} /></div>
                    <div className="cell-sub">{b.qty.available} {b.unit} · {b.category} · {b.donor}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <ShelfLife batch={b} now={now} />
                    <div className="cell-sub">{sc.plan.ok ? 'routable' : 'blocked'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <Route size={16} color="var(--brand)" />
            <h3>Dispatch plan {batch ? `· ${batch.id}` : ''}</h3>
            {batch && <span className="sub">{batch.donor}</span>}
            {batch && <div className="right"><StatusBadge status={batch.status} /></div>}
          </div>
          {!batch ? (
            <Empty>Select a batch from the priority queue</Empty>
          ) : (
            <div className="card-body">
              <div className="row wrap" style={{ marginBottom: 12, fontSize: 13 }}>
                <span className="badge b-gray">{batch.category}</span>
                <span className="badge b-gray">{batch.qty.available} of {batch.quantity} {batch.unit} available</span>
                <span className={`badge ${remainingMins(batch, now) <= 60 ? 'b-red' : 'b-gray'}`}>
                  {remainingMins(batch, now) > 0 ? `${formatDuration(remainingMins(batch, now))} shelf-life · safe window ${formatDuration(Math.max(0, remainingMins(batch, now) - state.settings.safetyBufferMins))}` : 'Expired'}
                </span>
              </div>
              <QuantityBar batch={batch} legend />

              <div className="divider" />
              <div className="row" style={{ marginBottom: 6 }}>
                <div className="section-title" style={{ margin: 0 }}>Why this priority</div>
                <span className="spacer" />
                <span className="mono strong">{score.total}/100</span>
                <StatusBadge status={score.level} dot={false} />
              </div>
              {score.parts.map((p) => (
                <div className="score-row" key={p.label}>
                  <span className="muted">{p.label}</span>
                  <div>
                    <div className="progress"><span style={{ width: `${(p.points / p.max) * 100}%`, background: 'var(--brand)' }} /></div>
                    <div className="cell-sub" style={{ marginTop: 2 }}>{p.why}</div>
                  </div>
                  <span className="mono" style={{ textAlign: 'right' }}>{p.points}/{p.max}</span>
                </div>
              ))}

              <div className="divider" />
              <div className="section-title">Proposed allocation</div>
              {plan.ok ? (
                <>
                  <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                    <table className="table">
                      <thead><tr><th>#</th><th>Rider</th><th>Shelter</th><th>Qty</th><th>Trip</th><th>Spare time</th></tr></thead>
                      <tbody>
                        {plan.allocations.map((a, i) => (
                          <tr key={a.riderId}>
                            <td className="mono subtle">{i + 1}</td>
                            <td><b>{a.riderName}</b><div className="cell-sub">free capacity {a.riderCapacity}</div></td>
                            <td>{a.shelterName}</td>
                            <td className="mono strong">{a.qty}</td>
                            <td className="mono" title={a.trip.parts.map((p) => `${p.label}: ${p.mins} min`).join('\n')}>
                              {a.trip.total} min
                              <div className="cell-sub">{a.trip.parts.map((p) => p.mins).join(' + ')}</div>
                            </td>
                            <td className="mono" style={{ color: a.slack < 10 ? 'var(--orange)' : 'var(--green)' }}>{a.slack} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="row wrap" style={{ marginTop: 12 }}>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Allocates <b className="mono" style={{ color: 'var(--text)' }}>{plan.totalAllocated}</b> of {plan.target} {batch.unit} across {plan.allocations.length} rider(s)
                      {plan.unallocated > 0 && <span style={{ color: 'var(--orange)' }}> · {plan.unallocated} cannot be placed safely yet</span>}
                    </span>
                    <span className="spacer" />
                    <button className="btn btn-primary" onClick={confirmDispatch}><CheckCircle2 size={15} /> Confirm dispatch</button>
                  </div>
                </>
              ) : (
                <div className={`callout ${plan.unsafe ? 'red' : 'orange'}`}>
                  <AlertOctagon size={16} style={{ flexShrink: 0 }} />
                  <div><b>{plan.unsafe ? 'Dispatch blocked for safety' : 'Cannot dispatch'}</b><div>{plan.blockedReason}</div></div>
                </div>
              )}
              <Rejections title="Riders not used" items={plan.rejectedRiders} />
              <Rejections title="Shelters rejected" items={plan.rejectedShelters} />

              {!plan.blockedReason?.startsWith('Batch') && batch.qty.available > 0 && remainingMins(batch, now) > 0 && (
                <>
                  <div className="divider" />
                  <ManualAssign batch={batch} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="tabs">
            <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active deliveries ({active.length})</button>
            <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Recently closed</button>
          </div>
        </div>
        {tab === 'active' ? (
          <AssignmentTable assignments={active} now={now} emptyText="No active deliveries. Confirm a dispatch plan above." />
        ) : history.length === 0 ? (
          <Empty>No closed assignments yet</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Assignment</th><th>Rider</th><th>Shelter</th><th>Qty</th><th>Outcome</th></tr></thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.id}</b><div className="cell-sub mono">{a.reservationId} · {a.batchId}</div></td>
                    <td>{state.riders.find((r) => r.id === a.riderId)?.name}</td>
                    <td>{shelterLabel(state.shelters.find((s) => s.id === a.shelterId))}</td>
                    <td className="mono">{a.qty} {a.unit}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <ShieldCheck size={16} color={integrity.length ? 'var(--red)' : 'var(--green)'} />
          <h3>Data integrity check</h3>
          <div className="right">{integrity.length ? <span className="badge b-red">{integrity.length} issue(s)</span> : <span className="badge b-green badge-dot">All invariants hold</span>}</div>
        </div>
        <div className="card-body" style={{ fontSize: 13 }}>
          {integrity.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--red)' }}>{integrity.map((x) => <li key={x}>{x}</li>)}</ul>
          ) : (
            <p className="muted">
              Checked live for all {state.batches.length} batches, {state.riders.length} riders and {state.shelters.length} shelters: available + reserved + collected + delivered + spoiled
              equals each batch's quantity, every reservation matches its stock, no rider exceeds capacity, no open shelter receives more than its demand or capacity, and all IDs are unique.
            </p>
          )}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <style>{`@media (max-width: 1080px) { #dispatch-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}
