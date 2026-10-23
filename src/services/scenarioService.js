// =====================================================================
// Failure Simulator scenarios. Each one changes the REAL app state using
// the same engine functions the operator uses, then returns a step-by-step
// report: { ok, title, steps: [{ ok, text }] }.
// =====================================================================
import {
  ACTIVE_STATUSES,
  getBatch,
  getRider,
  getShelter,
  isDispatchable,
  planDispatch,
  rankBatches,
  remainingMins,
  shelterLabel,
  validateAssignment,
} from './dispatchEngine.js';
import {
  acknowledge,
  addRider,
  completePickup,
  createAssignment,
  createBatch,
  dispatchBatch,
  startDelivery,
  timeoutReservation,
  updateShelter,
} from './reservationService.js';
import { addAlert, addLog } from './logService.js';
import { formatDuration, MINUTE } from '../utils/timeUtils.js';

const HOUR = 60 * MINUTE;

function report(title) {
  const steps = [];
  return {
    title,
    steps,
    step(ok, text) {
      steps.push({ ok, text });
    },
    done(ok, extra = {}) {
      return { ok, title, steps, ...extra };
    },
  };
}

function scenarioMeta(s) {
  if (!s.scenario) s.scenario = {};
  return s.scenario;
}

// ---------------- Scenario 1 ----------------
export function scenarioUrgentDonation(s, now) {
  const r = report('Urgent donation created');
  const res = createBatch(s, now, {
    donor: 'Sunrise Banquet Hall',
    category: 'Cooked meals',
    description: 'Emergency surplus — conference lunch cancelled',
    quantity: 180,
    unit: 'meals',
    pickupLocation: 'Sunrise Banquet Hall, Ring Road',
    preparedAt: now - 2 * HOUR,
    expiresAt: now + 75 * MINUTE,
    pickupMins: 10,
    deliveryMins: 20,
    storage: 'Hot holding (above 60°C)',
    handling: 'Insulated carriers, keep covered',
  });
  if (!res.ok) {
    r.step(false, res.reason);
    return r.done(false);
  }
  scenarioMeta(s).urgentBatchId = res.batch.id;
  const ranks = rankBatches(s, now);
  const pos = ranks.findIndex((x) => x.batch.id === res.batch.id);
  const score = ranks[pos]?.score;
  r.step(true, `Created ${res.batch.id}: 180 cooked meals from Sunrise Banquet Hall`);
  r.step(true, `Remaining shelf-life: ${formatDuration(remainingMins(res.batch, now))} (safe window ${formatDuration(remainingMins(res.batch, now) - s.settings.safetyBufferMins)} after buffer)`);
  if (score) {
    r.step(true, `Priority score ${score.total}/100 (${score.level}) — ranked #${pos + 1} of ${ranks.length} in the dispatch queue`);
    for (const p of score.parts) r.step(true, `${p.label}: ${p.points}/${p.max} — ${p.why}`);
  }
  return r.done(true, { batchId: res.batch.id, navigate: { page: 'dispatch', params: { batchId: res.batch.id } } });
}

// ---------------- Scenario 2 ----------------
export function scenarioCapacitySplit(s, now) {
  const r = report('Rider capacity split');
  // Make sure five squad riders exist with capacity 40
  let squad = s.riders.filter((x) => x.squad);
  if (squad.length < 5) {
    for (let i = squad.length + 1; i <= 5; i += 1) {
      addRider(s, now, { id: `R-20${i}`, name: `Rapid Squad ${i}`, vehicle: 'Scooter', zone: 'Central', capacity: 40, travelMins: 6, reliability: 95, squad: true });
    }
    squad = s.riders.filter((x) => x.squad);
    r.step(true, 'Added 5 squad riders, each with capacity 40');
  } else {
    let freed = 0;
    for (const x of squad) {
      const busy = s.assignments.some((a) => a.riderId === x.id && ACTIVE_STATUSES.includes(a.status));
      if (!busy && x.status !== 'Available') {
        x.status = 'Available';
        x.currentAssignment = null;
        freed += 1;
      }
    }
    r.step(true, `Using existing 5 squad riders (capacity 40)${freed ? `, ${freed} set back to available` : ''}`);
  }

  // Need a 180-meal urgent batch that is fully available
  let batch = getBatch(s, scenarioMeta(s).urgentBatchId);
  if (!batch || !isDispatchable(batch, now) || batch.qty.available < 180) {
    const created = scenarioUrgentDonation(s, now);
    batch = getBatch(s, created.batchId);
    r.step(true, `Created fresh urgent batch ${batch.id} (180 meals, 75 min shelf-life)`);
  } else {
    r.step(true, `Using urgent batch ${batch.id} (${batch.qty.available} meals available)`);
  }

  const res = dispatchBatch(s, now, batch.id, { riderIds: squad.map((x) => x.id) });
  if (!res.ok) {
    r.step(false, `Dispatch blocked: ${res.reason}`);
    return r.done(false, { navigate: { page: 'dispatch', params: { batchId: batch.id } } });
  }
  res.created.forEach((a, i) => {
    const rider = getRider(s, a.riderId);
    r.step(true, `Rider ${i + 1} (${rider.name}): ${a.qty} meals → ${shelterLabel(getShelter(s, a.shelterId))} · ETA ${a.tripMins} min`);
  });
  const total = res.created.reduce((x, a) => x + a.qty, 0);
  const overCap = res.created.filter((a) => a.qty > getRider(s, a.riderId).capacity);
  r.step(overCap.length === 0, overCap.length === 0 ? 'No rider exceeds capacity 40' : `${overCap.length} riders over capacity!`);
  r.step(true, `Allocated ${total} of 180 meals; reserved stock now ${batch.qty.reserved}, available ${batch.qty.available}`);
  const sum = batch.qty.available + batch.qty.reserved + batch.qty.collected + batch.qty.delivered + batch.qty.spoiled;
  r.step(sum === batch.quantity, `Integrity: available + reserved + collected + delivered + spoiled = ${sum} = original ${batch.quantity} (no double allocation)`);
  if (res.plan.unallocated > 0) r.step(false, `${res.plan.unallocated} meals left unallocated — not enough safe shelter demand or riders`);
  return r.done(true, { navigate: { page: 'dispatch', params: { batchId: batch.id } } });
}

// ---------------- Scenario 3 ----------------
export function scenarioGhostRider(s, now) {
  const r = report('Ghost rider recovery');
  let ghost = s.riders.find((x) => x.ghost);
  if (!ghost) {
    ghost = addRider(s, now, { name: 'Arjun Nair', capacity: 50, travelMins: 6, reliability: 58, ghost: true }).rider;
  }
  if (s.assignments.some((a) => a.riderId === ghost.id && ACTIVE_STATUSES.includes(a.status))) {
    r.step(false, `${ghost.name} already has an active assignment — finish it first`);
    return r.done(false);
  }
  ghost.status = 'Available';
  ghost.currentAssignment = null;
  r.step(true, `${ghost.name} marked available (simulated: will never acknowledge)`);

  // Find a batch the ghost can legitimately be assigned to
  const tryPlan = () => rankBatches(s, now).find((x) => planDispatch(s, x.batch.id, now, { riderIds: [ghost.id] }).ok);
  let target = tryPlan();
  if (!target) {
    createBatch(s, now, {
      donor: 'GreenLeaf Restaurant', category: 'Cooked meals', description: 'Dinner prep surplus', quantity: 40, unit: 'meals',
      pickupLocation: 'GreenLeaf Restaurant, MG Road', preparedAt: now - 30 * MINUTE, expiresAt: now + 3 * HOUR,
      pickupMins: 8, deliveryMins: 20, storage: 'Hot holding (above 60°C)', handling: 'None',
    }, { silent: true });
    target = tryPlan();
  }
  if (!target) {
    r.step(false, 'No feasible batch/shelter for the ghost rider — restore demo data and try again');
    return r.done(false);
  }
  const res = dispatchBatch(s, now, target.batch.id, { riderIds: [ghost.id] });
  const a = res.created?.[0];
  if (!a) {
    r.step(false, res.reason || 'Could not create reservation');
    return r.done(false);
  }
  r.step(true, `Reservation ${a.reservationId} created: ${a.qty} ${a.unit} of ${a.batchId} → ${shelterLabel(getShelter(s, a.shelterId))}`);
  r.step(true, `Rider status: Awaiting Acknowledgment (deadline ${s.settings.ackTimeoutSecs}s)`);
  const ackTry = acknowledge(s, now, a.id);
  r.step(true, `Acknowledgment attempt: ${ackTry.ok ? 'accepted' : 'no response'}`);

  // Fast-forward: the deadline passes
  a.ackDeadline = now;
  const batch = getBatch(s, a.batchId);
  const availBefore = batch.qty.available;
  const t = timeoutReservation(s, now, a.id, { manual: true });
  r.step(true, `Deadline passed → ${a.reservationId} marked Timed Out`);
  r.step(true, `Released ${t.released} ${a.unit} back to stock (it was never collected); available ${availBefore} → ${availBefore + t.released}`);
  r.step(true, `${ghost.name} marked Unresponsive and excluded from ${a.batchId}; reliability now ${ghost.reliability}`);
  if (t.reassigned.length) {
    for (const x of t.reassigned) {
      r.step(true, `Recovered: ${x.qty} ${x.unit} reassigned to ${getRider(s, x.riderId).name} (${x.reservationId}) → ${shelterLabel(getShelter(s, x.shelterId))}`);
    }
  } else {
    r.step(false, `No reassignment possible: ${t.reason}`);
  }
  r.step(true, `Batch ${batch.id} now: available ${batch.qty.available}, reserved ${batch.qty.reserved}`);
  return r.done(true, { navigate: { page: 'dispatch', params: { batchId: batch.id } } });
}

// ---------------- Scenario 4 ----------------
// Ensures a rider is carrying meals toward Shelter A, then removes Shelter A.
export function scenarioShelterClosure(s, now, mode = 'demand') {
  const r = report(mode === 'close' ? 'Shelter A closed mid-route' : 'Shelter A demand drops to zero');
  const shelterA = getShelter(s, 'SH-A');
  if (!shelterA) {
    r.step(false, 'Shelter A not found — restore demo data');
    return r.done(false);
  }
  let a = s.assignments.find((x) => x.shelterId === 'SH-A' && (x.status === 'In Transit' || x.status === 'Picked Up') && x.category === 'Cooked meals');
  if (!a) {
    // Build a real in-transit delivery to Shelter A using the normal lifecycle
    if (shelterA.status !== 'Open') shelterA.status = 'Open';
    const inbound = s.assignments.filter((x) => x.shelterId === 'SH-A' && ['Awaiting Ack', 'Acknowledged', 'Picked Up', 'In Transit'].includes(x.status) && x.category === 'Cooked meals').reduce((n, x) => n + x.qty, 0);
    if ((shelterA.demand['Cooked meals'] ?? 0) - inbound < 40) shelterA.demand['Cooked meals'] = inbound + 40;
    let plan = null;
    let batchId = null;
    for (const x of rankBatches(s, now)) {
      if (x.batch.category !== 'Cooked meals') continue;
      const p = planDispatch(s, x.batch.id, now, { shelterIds: ['SH-A'], maxQty: 40 });
      if (p.ok) {
        plan = p;
        batchId = x.batch.id;
        break;
      }
    }
    if (!plan) {
      const b = createBatch(s, now, {
        donor: 'Campus Mess', category: 'Cooked meals', description: 'Hostel lunch surplus', quantity: 40, unit: 'meals',
        pickupLocation: 'Campus Mess, University Gate 2', preparedAt: now - 30 * MINUTE, expiresAt: now + 2 * HOUR,
        pickupMins: 10, deliveryMins: 25, storage: 'Hot holding (above 60°C)', handling: 'None',
      }, { silent: true }).batch;
      batchId = b.id;
      plan = planDispatch(s, b.id, now, { shelterIds: ['SH-A'], maxQty: 40 });
    }
    const alloc = plan.allocations.find((x) => !getRider(s, x.riderId).ghost);
    if (!alloc) {
      r.step(false, `Could not set up a delivery to Shelter A: ${plan.blockedReason || 'no responsive rider available'}`);
      return r.done(false);
    }
    const c = createAssignment(s, now, { batchId, riderId: alloc.riderId, shelterId: 'SH-A', qty: alloc.qty });
    if (!c.ok) {
      r.step(false, c.reason);
      return r.done(false);
    }
    a = c.assignment;
    acknowledge(s, now, a.id);
    completePickup(s, now, a.id);
    startDelivery(s, now, a.id);
    r.step(true, `Setup: ${getRider(s, a.riderId).name} picked up ${a.qty} meals and is in transit to Shelter A`);
  } else {
    r.step(true, `${getRider(s, a.riderId).name} is carrying ${a.qty} meals toward Shelter A (${a.id})`);
  }
  const batch = getBatch(s, a.batchId);
  r.step(true, `Cargo shelf-life remaining: ${formatDuration(remainingMins(batch, now))}`);

  const change = mode === 'close'
    ? { status: 'Closed' }
    : { demand: { ...shelterA.demand, 'Cooked meals': 0 } };
  const note = mode === 'close' ? 'closed unexpectedly (operations halted)' : 'received a walk-in donation; cooked-meal demand is now 0';
  const res = updateShelter(s, now, 'SH-A', change, { note });
  r.step(true, `Shelter A ${note}`);
  const out = res.result;
  if (!out) {
    r.step(false, 'No change detected');
    return r.done(false);
  }
  r.step(true, `Detected ${out.rerouted.length + out.atRisk.length + out.released.length} affected assignment(s)`);
  for (const x of out.rerouted) {
    for (const rej of x.rejected) r.step(false, `Rejected ${rej.name}: ${rej.reasons.join('; ')}`);
    r.step(true, `Rerouted ${x.qty} ${x.unit} → ${x.to.name} (arrives in ${x.to.mins} min, ${x.to.demandLeft} still needed there)`);
  }
  for (const x of out.atRisk) {
    for (const rej of x.rejected) r.step(false, `Rejected ${rej.name}: ${rej.reasons.join('; ')}`);
    r.step(false, `${x.qty} ${x.unit} marked AT RISK — no safe destination, unsafe delivery not forced. Operator alert raised.`);
  }
  for (const x of out.released) r.step(true, `Uncollected reservation ${x.id} released (${x.qty}) and re-planned`);
  return r.done(true, { navigate: { page: 'dispatch' } });
}

// ---------------- Scenario 5 ----------------
export function scenarioNewDonationReceived(s, now) {
  const r = report('Shelter receives outside donation');
  const open = s.shelters.filter((x) => x.status === 'Open' && (x.demand['Cooked meals'] ?? 0) > 0);
  if (!open.length) {
    r.step(false, 'No open shelter has cooked-meal demand — restore demo data');
    return r.done(false);
  }
  // Pick the shelter with the most meals inbound (most likely to be over-served), else highest demand
  const inboundOf = (sh) => s.assignments.filter((a) => a.shelterId === sh.id && ['Awaiting Ack', 'Acknowledged', 'Picked Up', 'In Transit'].includes(a.status) && a.category === 'Cooked meals').reduce((n, a) => n + a.qty, 0);
  const target = [...open].sort((a, b) => inboundOf(b) - inboundOf(a) || b.demand['Cooked meals'] - a.demand['Cooked meals'])[0];
  const before = target.demand['Cooked meals'];
  const received = Math.min(before, 60);
  const topBefore = rankBatches(s, now).slice(0, 3).map((x) => `${x.batch.id} (${x.score.total})`);
  r.step(true, `${shelterLabel(target)} needs ${before} meals, ${inboundOf(target)} already on the way`);
  const res = updateShelter(s, now, target.id, { demand: { ...target.demand, 'Cooked meals': before - received } }, { note: `received ${received} meals from a local community kitchen; demand ${before} → ${before - received}` });
  target.received += received;
  r.step(true, `Outside donation of ${received} meals fulfilled part of the demand (${before} → ${before - received})`);
  const out = res.result;
  if (out) {
    if (out.rerouted.length + out.atRisk.length + out.released.length === 0) r.step(true, 'All inbound deliveries still fit the new demand — no changes needed');
    for (const x of out.rerouted) r.step(true, `Rerouted ${x.qty} ${x.unit} → ${x.to.name}`);
    for (const x of out.atRisk) r.step(false, `${x.qty} ${x.unit} at risk — operator alert raised`);
    for (const x of out.released) r.step(true, `Reservation ${x.id} released (${x.qty}) and re-planned to other shelters`);
  }
  const ranks = rankBatches(s, now);
  const topAfter = ranks.slice(0, 3).map((x) => `${x.batch.id} (${x.score.total})`);
  addLog(s, now, { type: 'Dispatch recalculated', description: `Priority queue updated: ${topAfter.join(', ') || 'empty'}`, status: 'info' });
  r.step(true, `Dispatch priorities recalculated. Before: ${topBefore.join(', ') || '—'} · After: ${topAfter.join(', ') || '—'}`);
  return r.done(true, { navigate: { page: 'shelters' } });
}

// ---------------- Scenario 6 ----------------
export function scenarioExpiryViolation(s, now) {
  const r = report('Expiry violation blocked');
  const res = createBatch(s, now, {
    donor: 'GreenLeaf Restaurant', category: 'Cooked meals', description: 'Late buffet leftovers — very short shelf-life', quantity: 50, unit: 'meals',
    pickupLocation: 'GreenLeaf Restaurant, MG Road', preparedAt: now - 3.5 * HOUR, expiresAt: now + 22 * MINUTE,
    pickupMins: 8, deliveryMins: 20, storage: 'Ambient', handling: 'None',
  }, { silent: true });
  const batch = res.batch;
  r.step(true, `Created ${batch.id}: 50 meals expiring in 22 min (safety buffer ${s.settings.safetyBufferMins} min → only ${22 - s.settings.safetyBufferMins} min usable)`);
  const d = dispatchBatch(s, now, batch.id);
  if (d.ok) {
    r.step(false, 'Dispatch was allowed — check settings (safety buffer may be 0)');
    return r.done(false);
  }
  r.step(true, d.reason);
  for (const rr of d.plan.rejectedRiders.slice(0, 3)) r.step(false, `${rr.name}: ${rr.reasons.join('; ')}`);
  r.step(true, 'No reservation created, no stock moved — batch stays visible so the donor can redistribute locally');
  addAlert(s, now, {
    kind: 'expiry',
    severity: 'warning',
    title: `${batch.id} cannot be delivered safely`,
    message: `${batch.qty.available} meals expire in ${formatDuration(remainingMins(batch, now))}. Ask the donor to share locally or use a nearby community fridge.`,
    batchId: batch.id,
    actions: ['ack'],
  });
  return r.done(true, { navigate: { page: 'dispatch', params: { batchId: batch.id } } });
}

// ---------------- Scenario 7 ----------------
export function scenarioResourceDependency(s, now) {
  const r = report('Resource dependency enforced');
  const shelterC = getShelter(s, 'SH-C');
  if (!shelterC) {
    r.step(false, 'Shelter C not found — restore demo data');
    return r.done(false);
  }
  const res = createBatch(s, now, {
    donor: 'Campus Mess', category: 'Dry ration kits', description: 'Raw rice and dal kits (need cooking)', quantity: 30, unit: 'kits',
    pickupLocation: 'Campus Mess, University Gate 2', preparedAt: now - 2 * HOUR, expiresAt: now + 20 * 24 * HOUR,
    pickupMins: 10, deliveryMins: 25, storage: 'Cool & dry', handling: 'Heavy',
  }, { silent: true });
  const batch = res.batch;
  r.step(true, `Created ${batch.id}: 30 raw ration kits`);
  r.step(true, `${shelterLabel(shelterC)}: clean water ${shelterC.resources.cleanWater ? 'yes' : 'NO'}, cooking fuel ${shelterC.resources.cookingFuel ? 'yes' : 'NO'}`);
  const rider = s.riders.find((x) => x.status === 'Available' && !x.ghost) || s.riders[0];
  const v = validateAssignment(s, { batchId: batch.id, riderId: rider.id, shelterId: 'SH-C', qty: Math.min(20, rider.capacity) }, now);
  if (v.ok) {
    r.step(false, 'Assignment was allowed — Shelter C seems to have water and fuel now');
    return r.done(false);
  }
  addLog(s, now, { type: 'Assignment rejected', description: `${batch.id} → ${shelterLabel(shelterC)} blocked: ${v.reasons.join('; ')}`, batchId: batch.id, riderId: rider.id, status: 'danger' });
  r.step(true, `Manual assignment ${batch.id} → Shelter C via ${rider.name} REJECTED`);
  for (const reason of v.reasons) r.step(false, reason);
  const plan = planDispatch(s, batch.id, now);
  if (plan.ok) {
    r.step(true, `Engine instead recommends: ${plan.allocations.map((x) => `${x.qty} → ${x.shelterName}`).join(', ')}`);
  } else {
    r.step(false, `No compatible alternative right now: ${plan.blockedReason}`);
  }
  return r.done(true, { navigate: { page: 'dispatch', params: { batchId: batch.id } } });
}
