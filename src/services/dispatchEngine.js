// =====================================================================
// RescueFlow Smart Dispatch Engine
// ---------------------------------------------------------------------
// Pure functions: they READ the state and return plans/explanations.
// Nothing here changes data (reservationService.js does that).
//
// Rules enforced for every allocation:
//   1. Expiry  : now + trip time  <=  expiry - safety buffer
//   2. Rider   : quantity <= rider free capacity, rider available
//   3. Shelter : quantity <= remaining demand AND remaining capacity
//                (counting deliveries already on the way)
//   4. Compat  : shelter has resources the aid depends on
//   5. Stock   : quantity <= batch available quantity (never twice)
// Prioritisation is a transparent points score (no machine learning).
// =====================================================================
import { checkCompatibility } from './compatibilityService.js';
import { CATEGORY_CRITICALITY } from '../data/constants.js';
import { formatDuration, MINUTE } from '../utils/timeUtils.js';

// Assignment statuses whose quantity is "heading to" a shelter
export const INBOUND_STATUSES = ['Awaiting Ack', 'Acknowledged', 'Picked Up', 'In Transit'];
// Every status where the assignment still needs action
export const ACTIVE_STATUSES = [...INBOUND_STATUSES, 'At Risk'];
// Cargo physically with the rider
export const COLLECTED_STATUSES = ['Picked Up', 'In Transit', 'At Risk'];

export const getBatch = (s, id) => s.batches.find((b) => b.id === id);
export const getRider = (s, id) => s.riders.find((r) => r.id === id);
export const getShelter = (s, id) => s.shelters.find((x) => x.id === id);
export const getAssignment = (s, id) => s.assignments.find((a) => a.id === id);
export const shelterLabel = (sh) => (sh ? `Shelter ${sh.code} · ${sh.name}` : 'Unknown shelter');

export function remainingMins(batch, now) {
  return (batch.expiresAt - now) / MINUTE;
}

export function freeCapacity(rider) {
  return Math.max(0, rider.capacity - rider.load);
}

// ---------- Shelter demand & capacity (including inbound deliveries) ----------
export function shelterInbound(s, shelterId, category, excludeAssignmentId = null) {
  let cat = 0;
  let total = 0;
  for (const a of s.assignments) {
    if (a.shelterId !== shelterId || a.id === excludeAssignmentId) continue;
    if (!INBOUND_STATUSES.includes(a.status)) continue;
    total += a.qty;
    if (a.category === category) cat += a.qty;
  }
  return { cat, total };
}

export function shelterRoom(s, shelter, category, excludeAssignmentId = null) {
  const inbound = shelterInbound(s, shelter.id, category, excludeAssignmentId);
  const demand = shelter.demand[category] ?? 0;
  const demandLeft = Math.max(0, demand - inbound.cat);
  const capacityLeft = Math.max(0, shelter.capacity - inbound.total);
  return { demand, demandLeft, capacityLeft, inbound, room: Math.min(demandLeft, capacityLeft) };
}

export function evaluateShelter(s, shelter, batch, excludeAssignmentId = null) {
  const compat = checkCompatibility(batch, shelter);
  const room = shelterRoom(s, shelter, batch.category, excludeAssignmentId);
  const reasons = [...compat.reasons];
  if (compat.ok) {
    if (room.demand <= 0) reasons.push(`No current demand for ${batch.category.toLowerCase()}`);
    else if (room.demandLeft <= 0) reasons.push(`Demand of ${room.demand} already covered by deliveries on the way`);
    else if (room.capacityLeft <= 0) reasons.push('Receiving capacity is full');
  }
  return { ok: reasons.length === 0, reasons, compatible: compat.ok, ...room };
}

// ---------- Rider eligibility ----------
export function evaluateRider(s, rider, batch) {
  const reasons = [];
  if (rider.status !== 'Available') reasons.push(`Rider is ${rider.status.toLowerCase()}`);
  if (batch && rider.excludedBatches.includes(batch.id)) {
    reasons.push('Missed an acknowledgment deadline for this batch');
  }
  if (freeCapacity(rider) <= 0) reasons.push('No free carrying capacity');
  if (s.assignments.some((a) => a.riderId === rider.id && ACTIVE_STATUSES.includes(a.status))) {
    reasons.push('Already holds an active assignment');
  }
  return { ok: reasons.length === 0, reasons };
}

function riderOrder(a, b) {
  return b.reliability - a.reliability || a.travelMins - b.travelMins || a.id.localeCompare(b.id);
}

// ---------- Time & expiry ----------
export function estimateTrip(s, batch, rider, shelter) {
  const parts = [
    { label: 'Rider to pickup', mins: rider.travelMins },
    { label: 'Loading at donor', mins: batch.pickupMins },
    { label: 'Travel to shelter', mins: shelter.travelMins },
    { label: 'Handover at shelter', mins: s.settings.handlingMins },
  ];
  return { parts, total: parts.reduce((sum, p) => sum + p.mins, 0) };
}

export function expiryCheck(s, batch, tripMins, now) {
  const buffer = s.settings.safetyBufferMins;
  const remaining = remainingMins(batch, now);
  const window = remaining - buffer; // usable minutes
  return { ok: tripMins <= window, remaining, window, buffer, slack: window - tripMins };
}

// Why a batch cannot be dispatched at all (or null if it can)
export function batchBlockReason(batch, now) {
  if (batch.cancelled) return 'Batch was cancelled';
  if (batch.status === 'Delivered' && batch.qty.available === 0) return 'Batch is already fully delivered';
  const rem = remainingMins(batch, now);
  if (rem <= 0) return `Batch expired ${formatDuration(-rem)} ago — expired food is never dispatched`;
  if (batch.qty.available <= 0) return 'Nothing left to dispatch: all units are reserved, collected or delivered';
  return null;
}

// =====================================================================
// planDispatch — splits a batch across riders and shelters.
// opts: { riderIds, shelterIds, maxQty }  (optional filters)
// Returns a plan object; it does NOT change state.
// =====================================================================
export function planDispatch(s, batchId, now, opts = {}) {
  const batch = getBatch(s, batchId);
  const plan = {
    batchId,
    ok: false,
    allocations: [],
    rejectedRiders: [],
    rejectedShelters: [],
    target: 0,
    totalAllocated: 0,
    unallocated: 0,
    blockedReason: null,
    unsafe: false,
    window: null,
  };
  if (!batch) {
    plan.blockedReason = 'Batch not found';
    return plan;
  }
  const block = batchBlockReason(batch, now);
  if (block) {
    plan.blockedReason = block;
    plan.unsafe = remainingMins(batch, now) <= 0;
    return plan;
  }

  const buffer = s.settings.safetyBufferMins;
  plan.window = remainingMins(batch, now) - buffer;
  let toAllocate = Math.min(batch.qty.available, opts.maxQty ?? Infinity);
  plan.target = toAllocate;

  // 1. Shelters: compatibility + demand + capacity
  const rooms = {};
  const shelters = [];
  for (const sh of s.shelters) {
    if (opts.shelterIds && !opts.shelterIds.includes(sh.id)) continue;
    const ev = evaluateShelter(s, sh, batch);
    if (ev.ok) {
      rooms[sh.id] = ev.room;
      shelters.push(sh);
    } else {
      plan.rejectedShelters.push({ id: sh.id, name: shelterLabel(sh), reasons: ev.reasons });
    }
  }

  // 2. Riders: availability + capacity, most reliable & closest first
  const riders = [];
  for (const r of s.riders) {
    if (opts.riderIds && !opts.riderIds.includes(r.id)) continue;
    const ev = evaluateRider(s, r, batch);
    if (ev.ok) riders.push(r);
    else plan.rejectedRiders.push({ id: r.id, name: r.name, reasons: ev.reasons });
  }
  riders.sort(riderOrder);

  // 3. Greedy split: each rider takes one full load to the best feasible shelter.
  //    If one rider can finish the remaining quantity in a single safe trip,
  //    that rider goes next (fewer trips, no tiny leftover loads).
  let fastestTrip = Infinity;
  const queue = [...riders];
  const canFinish = (rider) =>
    freeCapacity(rider) >= toAllocate &&
    shelters.some((sh) => rooms[sh.id] >= toAllocate && expiryCheck(s, batch, estimateTrip(s, batch, rider, sh).total, now).ok);
  while (queue.length && toAllocate > 0) {
    const finisherIdx = queue.findIndex(canFinish);
    const [rider] = queue.splice(finisherIdx >= 0 ? finisherIdx : 0, 1);
    const want = Math.min(freeCapacity(rider), toAllocate);
    const candidates = shelters
      .filter((sh) => rooms[sh.id] > 0)
      .map((sh) => {
        const trip = estimateTrip(s, batch, rider, sh);
        return { sh, trip, exp: expiryCheck(s, batch, trip.total, now) };
      });
    if (candidates.length === 0) break; // no shelter room left anywhere

    for (const c of candidates) fastestTrip = Math.min(fastestTrip, c.trip.total);
    const feasible = candidates.filter((c) => c.exp.ok);
    if (feasible.length === 0) {
      const best = Math.min(...candidates.map((c) => c.trip.total));
      plan.rejectedRiders.push({
        id: rider.id,
        name: rider.name,
        reasons: [`Fastest route takes ${best} min but only ${Math.max(0, Math.floor(plan.window))} min remain before the safe expiry deadline`],
      });
      continue;
    }
    // Prefer a shelter that can take the whole load (no wasted trips), then the fastest.
    const full = feasible.filter((c) => rooms[c.sh.id] >= want).sort((a, b) => a.trip.total - b.trip.total);
    const pick =
      full[0] ?? [...feasible].sort((a, b) => rooms[b.sh.id] - rooms[a.sh.id] || a.trip.total - b.trip.total)[0];
    const qty = Math.min(want, rooms[pick.sh.id]);

    plan.allocations.push({
      riderId: rider.id,
      riderName: rider.name,
      riderCapacity: freeCapacity(rider),
      shelterId: pick.sh.id,
      shelterName: shelterLabel(pick.sh),
      qty,
      trip: pick.trip,
      slack: Math.floor(pick.exp.slack),
    });
    rooms[pick.sh.id] -= qty;
    toAllocate -= qty;
  }

  plan.totalAllocated = plan.allocations.reduce((sum, a) => sum + a.qty, 0);
  plan.unallocated = plan.target - plan.totalAllocated;
  plan.ok = plan.allocations.length > 0;

  if (!plan.ok) {
    if (shelters.length === 0) {
      plan.blockedReason = `No open, compatible shelter has demand for ${batch.category.toLowerCase()}`;
    } else if (riders.length === 0) {
      plan.blockedReason = 'No eligible rider is available right now';
    } else if (Number.isFinite(fastestTrip)) {
      plan.unsafe = true;
      plan.blockedReason =
        `Unsafe dispatch blocked: the fastest possible delivery takes ${fastestTrip} min, but only ` +
        `${Math.max(0, Math.floor(plan.window))} min remain before the safe deadline ` +
        `(${formatDuration(remainingMins(batch, now))} shelf-life − ${buffer} min safety buffer).`;
    } else {
      plan.blockedReason = 'No shelter has room left for this batch';
    }
  }
  return plan;
}

// =====================================================================
// Manual assignment validation (operator picks rider + shelter + qty)
// =====================================================================
export function validateAssignment(s, { batchId, riderId, shelterId, qty }, now) {
  const reasons = [];
  const batch = getBatch(s, batchId);
  const rider = getRider(s, riderId);
  const shelter = getShelter(s, shelterId);
  if (!batch || !rider || !shelter) return { ok: false, reasons: ['Choose a batch, rider and shelter'] };

  const block = batchBlockReason(batch, now);
  if (block) return { ok: false, reasons: [block] };

  if (!Number.isInteger(qty) || qty <= 0) reasons.push('Quantity must be a whole number above zero');
  if (qty > batch.qty.available) reasons.push(`Only ${batch.qty.available} ${batch.unit} are available in this batch`);

  const rEv = evaluateRider(s, rider, batch);
  reasons.push(...rEv.reasons);
  if (qty > freeCapacity(rider)) reasons.push(`Exceeds rider capacity (${freeCapacity(rider)} of ${rider.capacity} free)`);

  const sEv = evaluateShelter(s, shelter, batch);
  if (!sEv.compatible) reasons.push(...sEv.reasons);
  else {
    if (qty > sEv.demandLeft) reasons.push(`Exceeds shelter demand (${sEv.demandLeft} ${batch.unit} still needed)`);
    if (qty > sEv.capacityLeft) reasons.push(`Exceeds shelter receiving capacity (${sEv.capacityLeft} left)`);
  }

  const trip = estimateTrip(s, batch, rider, shelter);
  const exp = expiryCheck(s, batch, trip.total, now);
  if (!exp.ok) {
    reasons.push(
      `Would arrive in ${trip.total} min, but the safe window is only ${Math.max(0, Math.floor(exp.window))} min (expiry minus ${exp.buffer} min buffer)`,
    );
  }
  return { ok: reasons.length === 0, reasons, trip, exp };
}

// =====================================================================
// Mid-route reroute search for cargo already with a rider
// =====================================================================
export function findRerouteOptions(s, assignment, now, { includeCurrent = false } = {}) {
  const batch = getBatch(s, assignment.batchId);
  const options = [];
  const rejected = [];
  const remaining = remainingMins(batch, now);
  const window = remaining - s.settings.safetyBufferMins;

  for (const sh of s.shelters) {
    if (sh.id === assignment.shelterId && !includeCurrent) continue;
    const ev = evaluateShelter(s, sh, batch, assignment.id);
    const reasons = [...ev.reasons];
    if (ev.ok && ev.room < assignment.qty) {
      reasons.push(`Room for only ${ev.room} of ${assignment.qty} ${assignment.unit}`);
    }
    // Rider is already moving: travel from the current position + handover
    const mins = sh.travelMins + s.settings.handlingMins;
    if (window < mins) {
      reasons.push(`Would arrive in ${mins} min — after the safe window (${Math.max(0, Math.floor(window))} min left)`);
    }
    const entry = { id: sh.id, name: shelterLabel(sh), mins, room: ev.room, demandLeft: ev.demandLeft, reasons };
    if (reasons.length === 0) options.push(entry);
    else rejected.push(entry);
  }
  options.sort((a, b) => a.mins - b.mins || b.demandLeft - a.demandLeft);
  return { options, rejected, remaining, window };
}

// =====================================================================
// Transparent priority score (0-100)
// =====================================================================
export function scoreBatch(s, batch, now) {
  const remaining = remainingMins(batch, now);
  const parts = [];

  let urgency;
  if (remaining <= 60) urgency = 40;
  else if (remaining <= 120) urgency = 32;
  else if (remaining <= 240) urgency = 24;
  else if (remaining <= 720) urgency = 14;
  else urgency = 6;
  parts.push({ label: 'Shelf-life urgency', points: urgency, max: 40, why: `${formatDuration(remaining)} until expiry` });

  const crit = CATEGORY_CRITICALITY[batch.category] ?? { points: 5, why: 'Standard aid' };
  parts.push({ label: 'Aid criticality', points: crit.points, max: 15, why: crit.why });

  let openDemand = 0;
  for (const sh of s.shelters) {
    const ev = evaluateShelter(s, sh, batch);
    if (ev.ok) openDemand += ev.room;
  }
  const available = Math.max(1, batch.qty.available);
  const demandPts = Math.round(20 * Math.min(1, openDemand / available));
  parts.push({ label: 'Shelter demand', points: demandPts, max: 20, why: `${openDemand} ${batch.unit} of open, compatible demand` });

  const plan = planDispatch(s, batch.id, now);
  parts.push({
    label: 'Delivery feasibility',
    points: plan.ok ? 15 : 0,
    max: 15,
    why: plan.ok ? `Safe routes found for ${plan.totalAllocated} of ${batch.qty.available} ${batch.unit}` : plan.blockedReason,
  });

  let freeCap = 0;
  let riderCount = 0;
  for (const r of s.riders) {
    if (evaluateRider(s, r, batch).ok) {
      freeCap += freeCapacity(r);
      riderCount += 1;
    }
  }
  const riderPts = Math.round(10 * Math.min(1, freeCap / available));
  parts.push({ label: 'Rider availability', points: riderPts, max: 10, why: `${riderCount} riders free, ${freeCap} units of capacity` });

  const total = parts.reduce((sum, p) => sum + p.points, 0);
  const level = total >= 75 ? 'Critical' : total >= 55 ? 'High' : total >= 35 ? 'Medium' : 'Low';
  return { batchId: batch.id, total, level, parts, plan, remaining };
}

export function isDispatchable(batch, now) {
  return !batchBlockReason(batch, now);
}

export function rankBatches(s, now) {
  return s.batches
    .filter((b) => isDispatchable(b, now))
    .map((b) => ({ batch: b, score: scoreBatch(s, b, now) }))
    .sort((a, b) => b.score.total - a.score.total || a.score.remaining - b.score.remaining);
}
