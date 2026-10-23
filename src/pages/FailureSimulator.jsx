import { ArrowRight, Ban, Building2, CheckCircle2, Droplets, Ghost, Megaphone, Play, RotateCcw, Siren, Split, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import {
  scenarioCapacitySplit,
  scenarioExpiryViolation,
  scenarioGhostRider,
  scenarioNewDonationReceived,
  scenarioResourceDependency,
  scenarioShelterClosure,
  scenarioUrgentDonation,
} from '../services/scenarioService.js';

const PAGE_NAMES = { dispatch: 'Dispatch Center', shelters: 'Shelters', riders: 'Riders', donations: 'Donations' };

const SCENARIOS = [
  { id: 1, icon: Siren, title: 'Create urgent donation', desc: 'Adds a batch of 180 cooked meals with only 75 minutes of shelf-life left.', expect: 'Batch is scored and jumps to the top of the priority queue.', runs: [{ label: 'Run scenario', fn: scenarioUrgentDonation }] },
  { id: 2, icon: Split, title: 'Rider capacity test', desc: 'Creates five riders with capacity 40 and dispatches the 180-meal batch.', expect: 'Split 40 + 40 + 40 + 40 + 20. No rider over capacity, nothing allocated twice.', runs: [{ label: 'Run scenario', fn: scenarioCapacitySplit }] },
  { id: 3, icon: Ghost, title: 'Ghost rider', desc: 'Assigns a reservation to a rider who never acknowledges, then lets the deadline pass.', expect: 'Reservation times out, uncollected stock is released and reassigned to another rider.', runs: [{ label: 'Run scenario', fn: scenarioGhostRider }] },
  { id: 4, icon: Building2, title: 'Shelter closure mid-route', desc: 'A rider is carrying meals to Shelter A. Shelter A then gets food elsewhere (demand → 0) or closes.', expect: 'System finds a safe alternative shelter, or marks the cargo At Risk instead of forcing an unsafe delivery.', runs: [{ label: 'Demand drops to 0', fn: (s, t) => scenarioShelterClosure(s, t, 'demand') }, { label: 'Close shelter', fn: (s, t) => scenarioShelterClosure(s, t, 'close'), secondary: true }] },
  { id: 5, icon: Megaphone, title: 'New donation received', desc: 'A shelter receives 60 meals from an outside source, so its remaining demand drops.', expect: 'Over-committed deliveries are rerouted and dispatch priorities are recalculated.', runs: [{ label: 'Run scenario', fn: scenarioNewDonationReceived }] },
  { id: 6, icon: Ban, title: 'Expiry violation', desc: 'Tries to dispatch 50 meals that expire in 22 minutes (15 min safety buffer).', expect: 'Dispatch is blocked with a clear reason. No stock is reserved.', runs: [{ label: 'Run scenario', fn: scenarioExpiryViolation }] },
  { id: 7, icon: Droplets, title: 'Resource dependency', desc: 'Tries to send raw ration kits to Shelter C, which has no clean water or cooking fuel.', expect: 'Assignment is rejected; the engine suggests compatible shelters instead.', runs: [{ label: 'Run scenario', fn: scenarioResourceDependency }] },
];

function Result({ res, onGo }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        {res.ok ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />}
        <b style={{ fontSize: 13.5 }}>{res.title}</b>
      </div>
      <div className="step-list">
        {res.steps.map((s, i) => (
          <div key={i} className="st">
            {s.ok ? <CheckCircle2 size={14} color="var(--green)" /> : <XCircle size={14} color="var(--red)" />}
            <span className={s.ok ? '' : 'muted'}>{s.text}</span>
          </div>
        ))}
      </div>
      {res.navigate && (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => onGo(res.navigate)}>
          View in {PAGE_NAMES[res.navigate.page] ?? res.navigate.page} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

export default function FailureSimulator() {
  const { run, toast, navigate, confirm, resetDemo } = useApp();
  const [results, setResults] = useState({});

  const exec = (sc, r) => {
    const res = run(r.fn);
    setResults((m) => ({ ...m, [sc.id]: res }));
    toast(res.ok ? 'success' : 'error', `Scenario ${sc.id}: ${res.title}`, res.ok ? 'Application state updated — see the step report' : res.steps.at(-1)?.text);
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Restore demo data?',
      message: 'All donations, riders, shelters, assignments and logs will be replaced with the original sample scenario.',
      confirmLabel: 'Restore demo',
      danger: true,
    });
    if (!ok) return;
    resetDemo();
    setResults({});
    toast('success', 'Demo restored', 'Original sample data loaded');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Failure Simulator</h1>
          <p>Trigger real operational failures. Each button changes the live application state through the same dispatch engine the operator uses — then shows exactly what the system did and why.</p>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {SCENARIOS.map((sc) => {
          const Icon = sc.icon;
          return (
            <div key={sc.id} className="card scenario">
              <div className="row">
                <div className="dot-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon size={16} /></div>
                <div>
                  <div className="scenario-num">Scenario {sc.id}</div>
                  <h3>{sc.title}</h3>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>{sc.desc}</p>
              <div className="callout gray" style={{ padding: '8px 12px' }}><span className="expect"><b>Expected:</b> {sc.expect}</span></div>
              <div className="row wrap">
                {sc.runs.map((r) => (
                  <button key={r.label} className={`btn btn-sm ${r.secondary ? 'btn-danger' : 'btn-primary'}`} onClick={() => exec(sc, r)}>
                    <Play size={13} /> {r.label}
                  </button>
                ))}
              </div>
              {results[sc.id] && <Result res={results[sc.id]} onGo={(n) => navigate(n.page, n.params)} />}
            </div>
          );
        })}

        <div className="card scenario">
          <div className="row">
            <div className="dot-icon" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}><RotateCcw size={16} /></div>
            <div>
              <div className="scenario-num">Scenario 8</div>
              <h3>Restore demo</h3>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Resets every donation, rider, shelter, assignment and log to the original sample data — useful before each judge's run.</p>
          <div className="callout gray" style={{ padding: '8px 12px' }}><span className="expect"><b>Expected:</b> Dashboard returns to the starting scenario with fresh, live timestamps.</span></div>
          <div className="row"><button className="btn btn-sm btn-danger-solid" onClick={reset}><RotateCcw size={13} /> Restore demo data</button></div>
        </div>
      </div>
    </div>
  );
}
