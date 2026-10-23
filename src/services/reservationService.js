// =====================================================================
// Reservation & delivery lifecycle — the ONLY place stock moves.
// Every function receives a draft copy of the state (s) and the current
// time (now), changes the draft, and returns a result object.
//
// Stock buckets per batch:
//   available -> reserved -> collected -> delivered
//                  |  (timeout/cancel)       \-> spoiled (expired / disposed)
//                  v
//               available   (ONLY if not collected yet)
// =====================================================================
import {
  ACTIVE_STATUSES,
  COLLECTED_STATUSES,
  INBOUND_STATUSES,
  batchBlockReason,
  findRerouteOptions,
  getAssignment,
  getBatch,
  getRider,
  getShelter,
  planDispatch,
  remainingMins,
  scoreBatch,
  shelterLabel,
  validateAssignment,
} from './dispatchEngine.js';
import { checkCompatibility } from './compatibilityService.js';
import { addAlert, addLog, resolveAlerts } from './logService.js';
import { nextId } from '../utils/idUtils.js';
import { formatDuration, MINUTE } from '../utils/timeUtils.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, reasons: [reason], ...extra });

function freeRider(rider, { status = 'Available' } = {}) {
  if (!rider) return;
  rider.currentAssignment = null;
  rider.status = status;
}

// ---------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------
export function validateBatchForm(form, now, existing = null) {
  const errors = [];
  const quantity = Number(form.quantity);
  if (!form.donor?.trim()) errors.push('Donor name is required');
  if (!form.category) errors.push('Aid category is required');
  if (!Number.isInteger(quantity) || quantity <= 0) errors.push('Quantity must be a whole number above zero');
  if (!form.unit?.trim()) errors.push('Unit is required');
  if (!form.pickupLocation?.trim()) errors.push('Pickup location is required');
  if (!form.expiresAt) errors.push('Expiry time is required');
  if (form.preparedAt && form.expiresAt && form.expiresAt <= form.preparedAt) {
    errors.push('Expiry must be after the preparation time');
  }
  if (!existing && form.expiresAt && form.expiresAt <= now) errors.push('Expiry time is already in the past');
  for (const [key, label] of [['pickupMins', 'Pickup duration'], ['deliveryMins', 'Delivery duration']]) {
    const v = Number(form[key]);
    if (!Number.isFinite(v) || v < 0 || v > 600) errors.push(`${label} must be between 0 and 600 minutes`);
  }
  if (existing) {
    const q = existing.qty;
    const committed = q.reserved + q.collected + q.delivered + q.spoiled;
    if (quantity < committed) errors.push(`Quantity cannot be below ${committed} (already reserved, collected, delivered or spoiled)`);
    const hasAssignments = form.category !== existing.category && committed > 0;
    if (hasAssignments) errors.push('Category cannot change after units were dispatched');
  }
  return errors;
}

export function createBatch(s, now, form, { silent = false } = {}) {
  const errors = validateBatchForm(form, now);
  if (errors.length) return { ok: false, reason: errors[0], reasons: errors };
  const quantity = Number(form.quantity);
  const batch = {
    id: nextId(s, 'batch', 'B'),
    donor: form.donor.trim(),
    category: form.category,
    description: form.description?.trim() || '',
    quantity,
    unit: form.unit.trim(),
    pickupLocation: form.pickupLocation.trim(),
    preparedAt: form.preparedAt || now,
    expiresAt: form.expiresAt,
    pickupMins: Number(form.pickupMins),
    deliveryMins: Number(form.deliveryMins),
    storage: form.storage,
    handling: form.handling?.trim() || 'None',
    qty: { available: quantity, reserved: 0, collected: 0, delivered: 0, spoiled: 0 },
    cancelledQty: 0,
    createdAt: now,
    cancelled: false,
    status: 'Available',
  };
  s.batches.unshift(batch);
  addLog(s, now, {
    type: 'Donation created',
    description: `${batch.donor} listed ${quantity} ${batch.unit} (${batch.category.toLowerCase()}), expires in ${formatDuration(remainingMins(batch, now))}`,
    batchId: batch.id,
    status: 'info',
  });
  if (!silent) {
    const score = scoreBatch(s, batch, now);
    addLog(s, now, {
      type: 'Batch prioritized',
      description: `${batch.id} scored ${score.total}/100 (${score.level}) — ${score.parts
        .filter((p) => p.points > 0)
        .map((p) => `${p.label.toLowerCase()} ${p.points}`)
        .join(', ')}`,
      batchId: batch.id,
      status: score.level === 'Critical' ? 'warning' : 'info',
    });
  }
  return { ok: true, batch };
}

export function updateBatch(s, now, id, form) {
  const batch = getBatch(s, id);
  if (!batch) return fail('Batch not found');
  if (batch.cancelled) return fail('Cancelled batches cannot be edited');
  const errors = validateBatchForm(form, now, batch);
  if (errors.length) return { ok: false, reason: errors[0], reasons: errors };
  const q = batch.qty;
  const newQty = Number(form.quantity);
  const committed = q.reserved + q.collected + q.delivered + q.spoiled;
  Object.assign(batch, {
    donor: form.donor.trim(),
    category: form.category,
    description: form.description?.trim() || '',
    unit: form.unit.trim(),
    pickupLocation: form.pickupLocation.trim(),
    preparedAt: form.preparedAt || batch.preparedAt,
    expiresAt: form.expiresAt,
    pickupMins: Number(form.pickupMins),
    deliveryMins: Number(form.deliveryMins),
    storage: form.storage,
    handling: form.handling?.trim() || 'None',
    quantity: newQty,
  });
  q.available = newQty - committed;
  addLog(s, now, { type: 'Donation updated', description: `${batch.id} details updated by operator`, batchId: id, status: 'info' });
  return { ok: true, batch };
}

export function cancelBatch(s, now, id) {
  const batch = getBatch(s, id);
  if (!batch) return fail('Batch not found');
  if (batch.cancelled) return fail('Batch is already cancelled');
  const collected = s.assignments.filter((a) => a.batchId === id && COLLECTED_STATUSES.includes(a.status));
  if (collected.length) {
    return fail(`${collected.length} rider(s) already carry this batch — finish or reroute those deliveries first`);
  }
  for (const a of s.assignments) {
    if (a.batchId === id && (a.status === 'Awaiting Ack' || a.status === 'Acknowledged')) {
      releaseReservation(s, now, a, 'Cancelled', 'batch cancelled by operator');
    }
  }
  batch.cancelledQty = batch.qty.available;
  batch.qty.available = 0;
  batch.cancelled = true;
  addLog(s, now, { type: 'Donation cancelled', description: `${batch.id} cancelled; ${batch.cancelledQty} ${batch.unit} withdrawn`, batchId: id, status: 'warning' });
  return { ok: true };
}

// ---------------------------------------------------------------------
// Assignments / reservations
// ---------------------------------------------------------------------
export function createAssignment(s, now, { batchId, riderId, shelterId, qty }, { reason = 'dispatch' } = {}) {
  const v = validateAssignment(s, { batchId, riderId, shelterId, qty }, now);
  if (!v.ok) return { ok: false, reason: v.reasons[0], reasons: v.reasons };

  const batch = getBatch(s, batchId);
  const rider = getRider(s, riderId);
  const shelter = getShelter(s, shelterId);

  // Duplicate reservation guard (same rider + same batch already active)
  if (s.assignments.some((a) => a.riderId === riderId && a.batchId === batchId && ACTIVE_STATUSES.includes(a.status))) {
    return fail('Duplicate reservation blocked: this rider already holds this batch');
  }

  batch.qty.available -= qty;
  batch.qty.reserved += qty;

  const a = {
    id: nextId(s, 'assignment', 'ASG'),
    reservationId: nextId(s, 'reservation', 'RSV'),
    batchId,
    riderId,
    shelterId,
    qty,
    category: batch.category,
    unit: batch.unit,
    status: 'Awaiting Ack',
    tripMins: v.trip.total,
    createdAt: now,
    ackDeadline: now + s.settings.ackTimeoutSecs * 1000,
    ackAt: null,
    pickedUpAt: null,
    departedAt: null,
    etaAt: now + v.trip.total * MINUTE,
    deliveredAt: null,
    reroutedFrom: null,
    prevStatus: null,
  };
  s.assignments.unshift(a);
  rider.status = 'Awaiting Ack';
  rider.currentAssignment = a.id;

  addLog(s, now, {
    type: 'Reservation created',
    description: `${a.reservationId}: ${qty} ${batch.unit} of ${batch.id} reserved for ${rider.name} (ack within ${s.settings.ackTimeoutSecs}s)`,
    batchId,
    riderId,
    status: 'info',
  });
  addLog(s, now, {
    type: 'Rider assigned',
    description: `${rider.name} → ${shelterLabel(shelter)} · ${qty} ${batch.unit} · ETA ${v.trip.total} min${reason !== 'dispatch' ? ` (${reason})` : ''}`,
    batchId,
    riderId,
    status: 'success',
  });
  return { ok: true, assignment: a };
}

export function executePlan(s, now, plan, { reason = 'dispatch' } = {}) {
  const created = [];
  const failed = [];
  for (const alloc of plan.allocations) {
    const res = createAssignment(s, now, { batchId: plan.batchId, riderId: alloc.riderId, shelterId: alloc.shelterId, qty: alloc.qty }, { reason });
    if (res.ok) created.push(res.assignment);
    else failed.push({ ...alloc, reasons: res.reasons });
  }
  return { created, failed };
}

// Plan + execute in one step. Logs a block if unsafe.
export function dispatchBatch(s, now, batchId, opts = {}) {
  const batch = getBatch(s, batchId);
  const plan = planDispatch(s, batchId, now, opts);
  if (!plan.ok) {
    addLog(s, now, {
      type: plan.unsafe ? 'Unsafe dispatch blocked' : 'Dispatch blocked',
      description: `${batchId}: ${plan.blockedReason}`,
      batchId,
      status: plan.unsafe ? 'danger' : 'warning',
    });
    return { ok: false, reason: plan.blockedReason, reasons: [plan.blockedReason], plan };
  }
  const { created, failed } = executePlan(s, now, plan, opts);
  addLog(s, now, {
    type: 'Dispatch created',
    description: `${batchId} split across ${created.length} rider(s): ${created.map((a) => `${a.qty}`).join(' + ')} = ${created.reduce((x, a) => x + a.qty, 0)} ${batch.unit}${plan.unallocated > 0 ? ` (${plan.unallocated} not allocated — no safe capacity)` : ''}`,
    batchId,
    status: 'success',
  });
  return { ok: created.length > 0, plan, created, failed };
}

export function acknowledge(s, now, id) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (a.status !== 'Awaiting Ack') return fail(`Cannot acknowledge — assignment is ${a.status}`);
  const rider = getRider(s, a.riderId);
  if (now > a.ackDeadline) return fail('Acknowledgment deadline already passed — reservation will be recovered');
  if (rider.ghost) return fail(`${rider.name} is not responding (simulated unresponsive rider)`);
  a.status = 'Acknowledged';
  a.ackAt = now;
  rider.status = 'Assigned';
  addLog(s, now, {
    type: 'Rider acknowledgment',
    description: `${rider.name} accepted ${a.reservationId} (${a.qty} ${a.unit}) after ${Math.round((now - a.createdAt) / 1000)}s`,
    batchId: a.batchId,
    riderId: rider.id,
    status: 'success',
  });
  return { ok: true };
}

// Moves reserved stock back to available. NEVER used for collected cargo.
function releaseReservation(s, now, a, newStatus, why) {
  if (COLLECTED_STATUSES.includes(a.status) || a.status === 'Delivered') {
    throw new Error('Integrity guard: collected cargo cannot be released to stock');
  }
  const batch = getBatch(s, a.batchId);
  const rider = getRider(s, a.riderId);
  const amount = Math.min(a.qty, batch.qty.reserved);
  batch.qty.reserved -= amount;
  batch.qty.available += amount;
  a.status = newStatus;
  a.closedAt = now;
  if (rider && rider.currentAssignment === a.id) freeRider(rider);
  addLog(s, now, {
    type: 'Stock released',
    description: `${a.reservationId}: ${amount} ${a.unit} returned to ${batch.id} available stock (${why})`,
    batchId: batch.id,
    riderId: a.riderId,
    status: 'warning',
  });
  return amount;
}

// Find riders for quantity that came back to stock.
function recover(s, now, batchId, qty, label) {
  const batch = getBatch(s, batchId);
  if (batchBlockReason(batch, now)) {
    return { reassigned: [], reason: batchBlockReason(batch, now) };
  }
  const plan = planDispatch(s, batchId, now, { maxQty: qty });
  if (!plan.ok) {
    addLog(s, now, { type: 'Recovery failed', description: `${batchId}: could not reassign ${qty} ${batch.unit} — ${plan.blockedReason}`, batchId, status: 'danger' });
    addAlert(s, now, {
      kind: 'recovery',
      severity: 'warning',
      title: `${batchId} needs a rider`,
      message: `${qty} ${batch.unit} were released but no safe rider/shelter is available: ${plan.blockedReason}`,
      batchId,
      actions: ['dispatch'],
    });
    return { reassigned: [], reason: plan.blockedReason, plan };
  }
  const { created } = executePlan(s, now, plan, { reason: label });
  addLog(s, now, {
    type: 'Recovery reassignment',
    description: `${batchId}: ${created.map((a) => `${a.qty} ${a.unit} → ${getRider(s, a.riderId).name}`).join(', ')}`,
    batchId,
    status: 'success',
  });
  return { reassigned: created, plan, reason: plan.unallocated > 0 ? `${plan.unallocated} ${batch.unit} still unassigned` : null };
}

// Ghost reservation recovery
export function timeoutReservation(s, now, id, { manual = false } = {}) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  const rider = getRider(s, a.riderId);
  if (COLLECTED_STATUSES.includes(a.status)) {
    addLog(s, now, {
      type: 'Release blocked',
      description: `${a.reservationId}: cargo already collected by ${rider.name} — it cannot be returned to available stock`,
      batchId: a.batchId,
      riderId: a.riderId,
      status: 'warning',
    });
    return fail('Cargo already collected — stock cannot be released. Use reroute instead.');
  }
  if (a.status !== 'Awaiting Ack' && a.status !== 'Acknowledged') return fail(`Assignment is already ${a.status}`);

  const wasAck = a.status === 'Acknowledged';
  addLog(s, now, {
    type: 'Reservation timeout',
    description: wasAck
      ? `${rider.name} acknowledged ${a.reservationId} but never collected it (no-show)`
      : `${rider.name} did not acknowledge ${a.reservationId} within ${s.settings.ackTimeoutSecs}s${manual ? ' (simulated)' : ''}`,
    batchId: a.batchId,
    riderId: a.riderId,
    status: 'danger',
  });
  const released = releaseReservation(s, now, a, 'Timed Out', 'rider unresponsive');
  rider.status = 'Unresponsive';
  if (!rider.excludedBatches.includes(a.batchId)) rider.excludedBatches.push(a.batchId);
  rider.reliability = Math.max(0, rider.reliability - 15);

  const rec = recover(s, now, a.batchId, released, `recovered from ${a.reservationId}`);
  return { ok: true, released, ...rec, assignment: a, rider };
}

export function cancelAssignment(s, now, id) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (COLLECTED_STATUSES.includes(a.status)) return fail('Cargo already collected — use reroute or complete delivery');
  if (a.status !== 'Awaiting Ack' && a.status !== 'Acknowledged') return fail(`Assignment is already ${a.status}`);
  const released = releaseReservation(s, now, a, 'Cancelled', 'cancelled by operator');
  resolveAlerts(s, (al) => al.assignmentId === id, now);
  return { ok: true, released };
}

export function completePickup(s, now, id) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (a.status === 'Awaiting Ack') return fail('Rider must acknowledge before pickup');
  if (a.status !== 'Acknowledged') return fail(`Cannot pick up — assignment is ${a.status}`);
  const batch = getBatch(s, a.batchId);
  const rider = getRider(s, a.riderId);
  if (remainingMins(batch, now) <= 0) return fail('Batch has expired — pickup blocked for food safety');
  if (rider.load + a.qty > rider.capacity) return fail('Pickup would exceed rider capacity');
  if (batch.qty.reserved < a.qty) return fail('Integrity guard: reserved stock is lower than this assignment');
  batch.qty.reserved -= a.qty;
  batch.qty.collected += a.qty;
  rider.load += a.qty;
  rider.status = 'Carrying';
  a.status = 'Picked Up';
  a.pickedUpAt = now;
  addLog(s, now, { type: 'Pickup completed', description: `${rider.name} collected ${a.qty} ${a.unit} from ${batch.donor}`, batchId: batch.id, riderId: rider.id, status: 'info' });
  return { ok: true };
}

export function startDelivery(s, now, id) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (a.status !== 'Picked Up') return fail(`Cannot start delivery — assignment is ${a.status}`);
  const shelter = getShelter(s, a.shelterId);
  const rider = getRider(s, a.riderId);
  a.status = 'In Transit';
  a.departedAt = now;
  a.etaAt = now + (shelter.travelMins + s.settings.handlingMins) * MINUTE;
  addLog(s, now, { type: 'Delivery started', description: `${rider.name} heading to ${shelterLabel(shelter)} with ${a.qty} ${a.unit}`, batchId: a.batchId, riderId: rider.id, status: 'info' });
  // Destination might already be invalid
  const check = destinationStillValid(s, a);
  if (!check.ok) {
    const rr = rerouteAssignment(s, now, a, check.reason);
    return { ok: true, rerouted: rr };
  }
  return { ok: true };
}

function destinationStillValid(s, a) {
  const shelter = getShelter(s, a.shelterId);
  const batch = getBatch(s, a.batchId);
  const compat = checkCompatibility(batch, shelter);
  if (!compat.ok) return { ok: false, reason: compat.reasons[0] };
  // Committed load excluding this assignment
  let cat = 0;
  let total = 0;
  for (const x of s.assignments) {
    if (x.id === a.id || x.shelterId !== a.shelterId || !INBOUND_STATUSES.includes(x.status)) continue;
    total += x.qty;
    if (x.category === a.category) cat += x.qty;
  }
  const demand = shelter.demand[a.category] ?? 0;
  if (demand - cat < a.qty) return { ok: false, reason: `Shelter demand dropped to ${Math.max(0, demand - cat)} ${a.unit}` };
  if (shelter.capacity - total < a.qty) return { ok: false, reason: 'Shelter receiving capacity is full' };
  return { ok: true };
}

export function completeDelivery(s, now, id) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (a.status === 'Delivered') return fail('Duplicate delivery blocked — already delivered');
  if (a.status !== 'In Transit') return fail(`Cannot complete — assignment is ${a.status}`);
  const batch = getBatch(s, a.batchId);
  const rider = getRider(s, a.riderId);
  const shelter = getShelter(s, a.shelterId);

  if (remainingMins(batch, now) <= 0) {
    markExpiredCargo(s, now, a);
    return fail('Cargo has expired — delivery blocked. Dispose safely.');
  }
  const check = destinationStillValid(s, a);
  if (!check.ok) {
    const rr = rerouteAssignment(s, now, a, check.reason);
    return fail(`Delivery blocked: ${check.reason}. ${rr.ok ? `Rerouted to ${rr.to.name}.` : 'No safe alternative — marked At Risk.'}`, { rerouted: rr });
  }
  if (batch.qty.collected < a.qty) return fail('Integrity guard: collected stock is lower than this delivery');

  batch.qty.collected -= a.qty;
  batch.qty.delivered += a.qty;
  shelter.demand[a.category] = Math.max(0, (shelter.demand[a.category] ?? 0) - a.qty);
  shelter.capacity = Math.max(0, shelter.capacity - a.qty);
  shelter.received += a.qty;
  rider.load = Math.max(0, rider.load - a.qty);
  rider.completed += 1;
  rider.reliability = Math.min(100, rider.reliability + 1);
  freeRider(rider);
  a.status = 'Delivered';
  a.deliveredAt = now;
  resolveAlerts(s, (al) => al.assignmentId === id, now);
  addLog(s, now, {
    type: 'Delivery completed',
    description: `${rider.name} delivered ${a.qty} ${a.unit} to ${shelterLabel(shelter)} with ${formatDuration(remainingMins(batch, now))} shelf-life to spare`,
    batchId: batch.id,
    riderId: rider.id,
    status: 'success',
  });
  return { ok: true };
}

// ---------------------------------------------------------------------
// Mid-route rerouting
// ---------------------------------------------------------------------
export function rerouteAssignment(s, now, a, cause) {
  const batch = getBatch(s, a.batchId);
  const rider = getRider(s, a.riderId);
  const from = getShelter(s, a.shelterId);
  const search = findRerouteOptions(s, a, now, { includeCurrent: a.status === 'At Risk' });

  if (search.options.length > 0) {
    const best = search.options[0];
    if (best.id !== a.shelterId) a.reroutedFrom = a.shelterId;
    a.shelterId = best.id;
    if (a.status === 'At Risk') a.status = a.prevStatus || 'In Transit';
    a.prevStatus = null;
    a.etaAt = now + best.mins * MINUTE;
    resolveAlerts(s, (al) => al.assignmentId === a.id, now);
    addLog(s, now, {
      type: 'Reroute proposed',
      description: `${a.qty} ${a.unit} with ${rider.name}: ${shelterLabel(from)} no longer eligible (${cause}). Checked ${search.options.length + search.rejected.length} alternatives; safest is ${best.name} (${best.mins} min, ${best.demandLeft} ${a.unit} needed, ${formatDuration(search.remaining)} shelf-life left)`,
      batchId: batch.id,
      riderId: rider.id,
      status: 'warning',
    });
    addLog(s, now, {
      type: 'Reroute applied',
      description: `${a.id} redirected ${shelterLabel(from)} → ${best.name}, new ETA ${best.mins} min`,
      batchId: batch.id,
      riderId: rider.id,
      status: 'success',
    });
    return { ok: true, to: best, from: shelterLabel(from), rejected: search.rejected, options: search.options };
  }

  if (a.status !== 'At Risk') a.prevStatus = a.status;
  a.status = 'At Risk';
  addAlert(s, now, {
    kind: 'at-risk',
    severity: 'danger',
    title: `${a.qty} ${a.unit} at risk with ${rider.name}`,
    message: `${shelterLabel(from)} can no longer accept this cargo (${cause}) and no other shelter can take it safely. ${formatDuration(search.remaining)} shelf-life left.`,
    assignmentId: a.id,
    batchId: batch.id,
    actions: ['retry', 'dispose'],
  });
  addLog(s, now, {
    type: 'Assignment at risk',
    description: `${a.id}: no safe destination for ${a.qty} ${a.unit} — unsafe delivery NOT forced; operator intervention required`,
    batchId: batch.id,
    riderId: rider.id,
    status: 'danger',
  });
  return { ok: false, rejected: search.rejected, reason: 'No safe alternative shelter' };
}

// Called whenever a shelter's demand, capacity, resources or status changes.
export function handleShelterChange(s, now, shelterId) {
  const shelter = getShelter(s, shelterId);
  const result = { kept: [], rerouted: [], atRisk: [], released: [], reassigned: [] };
  const active = s.assignments
    .filter((a) => a.shelterId === shelterId && INBOUND_STATUSES.includes(a.status))
    // Cargo already on the road is protected first, then oldest reservations
    .sort((x, y) => (COLLECTED_STATUSES.includes(y.status) ? 1 : 0) - (COLLECTED_STATUSES.includes(x.status) ? 1 : 0) || x.createdAt - y.createdAt);

  const keptCat = {};
  let keptTotal = 0;
  const affected = [];
  for (const a of active) {
    const batch = getBatch(s, a.batchId);
    const compat = checkCompatibility(batch, shelter);
    const demand = shelter.demand[a.category] ?? 0;
    const used = keptCat[a.category] ?? 0;
    let reason = null;
    if (!compat.ok) reason = compat.reasons[0];
    else if (used + a.qty > demand) reason = `demand now ${Math.max(0, demand - used)} ${a.unit}`;
    else if (keptTotal + a.qty > shelter.capacity) reason = 'receiving capacity full';
    if (reason) affected.push({ a, reason });
    else {
      keptCat[a.category] = used + a.qty;
      keptTotal += a.qty;
      result.kept.push(a.id);
    }
  }

  for (const { a, reason } of affected) {
    if (COLLECTED_STATUSES.includes(a.status)) {
      const rr = rerouteAssignment(s, now, a, reason);
      if (rr.ok) result.rerouted.push({ id: a.id, qty: a.qty, unit: a.unit, to: rr.to, rejected: rr.rejected });
      else result.atRisk.push({ id: a.id, qty: a.qty, unit: a.unit, rejected: rr.rejected });
    } else {
      // Not collected yet: safe to release and re-plan
      const released = releaseReservation(s, now, a, 'Cancelled', `destination changed: ${reason}`);
      result.released.push({ id: a.id, qty: released });
      const rec = recover(s, now, a.batchId, released, `replanned from ${a.reservationId}`);
      result.reassigned.push(...rec.reassigned.map((x) => x.id));
    }
  }
  return result;
}

export function updateShelter(s, now, id, changes, { note } = {}) {
  const shelter = getShelter(s, id);
  if (!shelter) return fail('Shelter not found');
  const before = JSON.stringify({ d: shelter.demand, c: shelter.capacity, st: shelter.status, r: shelter.resources });
  if (changes.demand) {
    for (const [cat, val] of Object.entries(changes.demand)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return fail(`Demand for ${cat} must be zero or more`);
    }
    shelter.demand = Object.fromEntries(Object.entries(changes.demand).map(([k, v]) => [k, Math.round(Number(v))]));
  }
  if (changes.capacity !== undefined) {
    const c = Number(changes.capacity);
    if (!Number.isFinite(c) || c < 0) return fail('Capacity must be zero or more');
    shelter.capacity = Math.round(c);
  }
  if (changes.resources) shelter.resources = { ...shelter.resources, ...changes.resources };
  if (changes.status) shelter.status = changes.status;
  const after = JSON.stringify({ d: shelter.demand, c: shelter.capacity, st: shelter.status, r: shelter.resources });
  if (before === after) return { ok: true, unchanged: true, result: null };

  addLog(s, now, {
    type: changes.status === 'Closed' ? 'Shelter closed' : changes.status === 'Open' ? 'Shelter reopened' : 'Shelter demand changed',
    description: `${shelterLabel(shelter)}: ${note || 'details updated'}`,
    status: changes.status === 'Closed' ? 'danger' : 'warning',
  });
  const result = handleShelterChange(s, now, id);
  return { ok: true, result };
}

export function resolveAtRisk(s, now, id, action) {
  const a = getAssignment(s, id);
  if (!a) return fail('Assignment not found');
  if (a.status !== 'At Risk') return fail('Assignment is no longer at risk');
  if (action === 'retry') {
    if (a.expiredCargo || remainingMins(getBatch(s, a.batchId), now) <= 0) {
      return fail('Cargo has expired — it can only be disposed safely');
    }
    const rr = rerouteAssignment(s, now, a, 'retry by operator');
    return rr.ok ? { ok: true, to: rr.to } : fail('Still no safe destination. Free up shelter demand or dispose safely.');
  }
  if (action === 'dispose') {
    const batch = getBatch(s, a.batchId);
    const rider = getRider(s, a.riderId);
    batch.qty.collected -= a.qty;
    batch.qty.spoiled += a.qty;
    rider.load = Math.max(0, rider.load - a.qty);
    freeRider(rider);
    a.status = 'Disposed';
    a.closedAt = now;
    resolveAlerts(s, (al) => al.assignmentId === id, now);
    addLog(s, now, {
      type: 'Cargo disposed',
      description: `${a.qty} ${a.unit} from ${batch.id} recorded as safely disposed (food-safety rule) — rider ${rider.name} released`,
      batchId: batch.id,
      riderId: rider.id,
      status: 'warning',
    });
    return { ok: true };
  }
  return fail('Unknown action');
}

function markExpiredCargo(s, now, a) {
  if (a.expiredCargo) return;
  const rider = getRider(s, a.riderId);
  a.expiredCargo = true;
  if (a.status !== 'At Risk') a.prevStatus = a.status;
  a.status = 'At Risk';
  addAlert(s, now, {
    kind: 'at-risk',
    severity: 'danger',
    title: `Expired cargo with ${rider.name}`,
    message: `${a.qty} ${a.unit} passed expiry while in transit. Do NOT distribute — dispose safely.`,
    assignmentId: a.id,
    batchId: a.batchId,
    actions: ['dispose'],
  });
  addLog(s, now, { type: 'Batch expired', description: `${a.qty} ${a.unit} expired in transit with ${rider.name} — delivery blocked`, batchId: a.batchId, riderId: rider.id, status: 'danger' });
}

// ---------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------
export function addRider(s, now, form) {
  const capacity = Number(form.capacity);
  const travel = Number(form.travelMins);
  const reliability = Number(form.reliability ?? 85);
  if (!form.name?.trim()) return fail('Rider name is required');
  if (!Number.isInteger(capacity) || capacity <= 0) return fail('Capacity must be a whole number above zero');
  if (!Number.isFinite(travel) || travel < 0) return fail('Travel time must be zero or more');
  if (!Number.isFinite(reliability) || reliability < 0 || reliability > 100) return fail('Reliability must be 0–100');
  const rider = {
    id: form.id || nextId(s, 'rider', 'R'),
    name: form.name.trim(),
    vehicle: form.vehicle || 'Scooter',
    zone: form.zone || 'Central',
    capacity,
    load: 0,
    status: 'Available',
    reliability,
    travelMins: travel,
    ghost: !!form.ghost,
    excludedBatches: [],
    currentAssignment: null,
    completed: 0,
    squad: !!form.squad,
  };
  s.riders.push(rider);
  addLog(s, now, { type: 'Rider added', description: `${rider.name} joined (capacity ${capacity})`, riderId: rider.id, status: 'info' });
  return { ok: true, rider };
}

export function setRiderAvailability(s, now, id, status) {
  const rider = getRider(s, id);
  if (!rider) return fail('Rider not found');
  const active = s.assignments.find((a) => a.riderId === id && ACTIVE_STATUSES.includes(a.status));
  if (active) return fail(`${rider.name} has an active assignment (${active.id})`);
  const prev = rider.status;
  rider.status = status;
  rider.currentAssignment = null;
  addLog(s, now, {
    type: status === 'Available' ? 'Rider available' : 'Rider off duty',
    description: `${rider.name}: ${prev} → ${status}`,
    riderId: id,
    status: status === 'Available' ? 'success' : 'info',
  });
  return { ok: true };
}

export function toggleGhost(s, now, id) {
  const rider = getRider(s, id);
  if (!rider) return fail('Rider not found');
  rider.ghost = !rider.ghost;
  addLog(s, now, {
    type: 'Simulation setting',
    description: `${rider.name} will ${rider.ghost ? 'NOT respond' : 'respond normally'} to new reservations`,
    riderId: id,
    status: 'info',
  });
  return { ok: true, ghost: rider.ghost };
}

export function updateSettings(s, now, settings) {
  const buffer = Number(settings.safetyBufferMins);
  const ack = Number(settings.ackTimeoutSecs);
  const handling = Number(settings.handlingMins);
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 120) return fail('Safety buffer must be 0–120 minutes');
  if (!Number.isFinite(ack) || ack < 10 || ack > 1800) return fail('Acknowledgment timeout must be 10–1800 seconds');
  if (!Number.isFinite(handling) || handling < 0 || handling > 60) return fail('Handling time must be 0–60 minutes');
  s.settings = { safetyBufferMins: buffer, ackTimeoutSecs: ack, handlingMins: handling };
  addLog(s, now, { type: 'Settings updated', description: `Safety buffer ${buffer} min · ack timeout ${ack}s · handling ${handling} min`, status: 'info' });
  return { ok: true };
}

// ---------------------------------------------------------------------
// Periodic checks: ack deadlines + expiry
// ---------------------------------------------------------------------
export function processTick(s, now) {
  const events = [];
  for (const a of [...s.assignments]) {
    if (a.status === 'Awaiting Ack' && now >= a.ackDeadline) {
      const res = timeoutReservation(s, now, a.id);
      if (res.ok) {
        events.push({
          type: 'warning',
          title: 'Reservation timed out',
          message: `${res.rider.name} did not respond. ${res.released} ${a.unit} released${res.reassigned.length ? ` and reassigned to ${res.reassigned.map((x) => getRider(s, x.riderId).name).join(', ')}` : ` — ${res.reason ?? 'no reassignment possible'}`}.`,
        });
      }
    }
  }
  for (const b of s.batches) {
    if (b.cancelled || now < b.expiresAt) continue;
    if (b.qty.available > 0) {
      const n = b.qty.available;
      b.qty.spoiled += n;
      b.qty.available = 0;
      addLog(s, now, { type: 'Batch expired', description: `${b.id}: ${n} ${b.unit} expired before they could be dispatched`, batchId: b.id, status: 'danger' });
      events.push({ type: 'error', title: `${b.id} expired`, message: `${n} ${b.unit} passed their expiry time.` });
    }
    for (const a of s.assignments) {
      if (a.batchId !== b.id) continue;
      if (a.status === 'Awaiting Ack' || a.status === 'Acknowledged') {
        const rider = getRider(s, a.riderId);
        b.qty.reserved -= a.qty;
        b.qty.spoiled += a.qty;
        a.status = 'Expired';
        a.closedAt = now;
        if (rider && rider.currentAssignment === a.id) freeRider(rider);
        addLog(s, now, { type: 'Batch expired', description: `${a.reservationId}: ${a.qty} ${a.unit} expired before pickup — reservation closed`, batchId: b.id, riderId: a.riderId, status: 'danger' });
      } else if ((a.status === 'Picked Up' || a.status === 'In Transit' || a.status === 'At Risk') && !a.expiredCargo) {
        markExpiredCargo(s, now, a);
        events.push({ type: 'error', title: 'Cargo expired in transit', message: `${a.qty} ${a.unit} must be disposed, not delivered.` });
      }
    }
  }
  return { changed: events.length > 0, events };
}

// ---------------------------------------------------------------------
// Derived batch status + integrity checks
// ---------------------------------------------------------------------
export function deriveBatchStatus(s, b, now) {
  if (b.cancelled) return 'Cancelled';
  const acts = s.assignments.filter((a) => a.batchId === b.id);
  const has = (st) => acts.some((a) => a.status === st);
  if (has('In Transit') || has('Picked Up') || has('At Risk')) return 'In Transit';
  if (has('Acknowledged')) return 'Assigned';
  if (has('Awaiting Ack')) return 'Reserved';
  const q = b.qty;
  if (q.available > 0 && now < b.expiresAt) return 'Available';
  if (q.delivered > 0 && q.delivered >= q.spoiled) return 'Delivered';
  return 'Expired';
}

export function recomputeStatuses(s, now) {
  for (const b of s.batches) b.status = deriveBatchStatus(s, b, now);
}

export function checkIntegrity(s) {
  const issues = [];
  for (const b of s.batches) {
    const q = b.qty;
    for (const [k, v] of Object.entries(q)) if (v < 0) issues.push(`${b.id}: negative ${k} (${v})`);
    const sum = q.available + q.reserved + q.collected + q.delivered + q.spoiled;
    const expected = b.quantity - (b.cancelledQty || 0);
    if (sum > b.quantity) issues.push(`${b.id}: buckets (${sum}) exceed original quantity (${b.quantity})`);
    if (sum !== expected) issues.push(`${b.id}: buckets (${sum}) do not match quantity (${expected})`);
    const acts = s.assignments.filter((a) => a.batchId === b.id);
    const reserved = acts.filter((a) => a.status === 'Awaiting Ack' || a.status === 'Acknowledged').reduce((x, a) => x + a.qty, 0);
    const collected = acts.filter((a) => COLLECTED_STATUSES.includes(a.status)).reduce((x, a) => x + a.qty, 0);
    const delivered = acts.filter((a) => a.status === 'Delivered').reduce((x, a) => x + a.qty, 0);
    if (reserved !== q.reserved) issues.push(`${b.id}: reserved ${q.reserved} ≠ active reservations ${reserved}`);
    if (collected !== q.collected) issues.push(`${b.id}: collected ${q.collected} ≠ cargo with riders ${collected}`);
    if (delivered !== q.delivered) issues.push(`${b.id}: delivered ${q.delivered} ≠ delivery records ${delivered}`);
  }
  for (const r of s.riders) {
    if (r.load > r.capacity) issues.push(`${r.name}: load ${r.load} exceeds capacity ${r.capacity}`);
    const carrying = s.assignments.filter((a) => a.riderId === r.id && COLLECTED_STATUSES.includes(a.status)).reduce((x, a) => x + a.qty, 0);
    if (carrying !== r.load) issues.push(`${r.name}: load ${r.load} ≠ cargo records ${carrying}`);
    const active = s.assignments.filter((a) => a.riderId === r.id && ACTIVE_STATUSES.includes(a.status));
    if (active.length > 1) issues.push(`${r.name}: ${active.length} active assignments (max 1)`);
  }
  for (const sh of s.shelters) {
    if (sh.capacity < 0) issues.push(`${sh.name}: negative capacity`);
    const inbound = s.assignments.filter((a) => a.shelterId === sh.id && INBOUND_STATUSES.includes(a.status));
    const total = inbound.reduce((x, a) => x + a.qty, 0);
    if (sh.status === 'Open' && total > sh.capacity) issues.push(`${sh.name}: inbound ${total} exceeds capacity ${sh.capacity}`);
    for (const [cat, d] of Object.entries(sh.demand)) {
      if (d < 0) issues.push(`${sh.name}: negative demand for ${cat}`);
      const catIn = inbound.filter((a) => a.category === cat).reduce((x, a) => x + a.qty, 0);
      if (sh.status === 'Open' && catIn > d) issues.push(`${sh.name}: inbound ${catIn} ${cat} exceeds demand ${d}`);
    }
  }
  const ids = new Set();
  for (const a of s.assignments) {
    if (ids.has(a.id)) issues.push(`Duplicate assignment ID ${a.id}`);
    ids.add(a.id);
  }
  const bIds = new Set();
  for (const b of s.batches) {
    if (bIds.has(b.id)) issues.push(`Duplicate batch ID ${b.id}`);
    bIds.add(b.id);
  }
  return issues;
}
