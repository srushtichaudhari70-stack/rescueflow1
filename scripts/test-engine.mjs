// Automated checks for the RescueFlow engine. Run with:  npm test
// Each test starts from fresh demo data and uses the same functions the UI uses.
import { createDemoState } from '../src/data/demoData.js';
import * as E from '../src/services/dispatchEngine.js';
import * as R from '../src/services/reservationService.js';
import * as S from '../src/services/scenarioService.js';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}
function fresh() {
  const now = Date.now();
  const s = createDemoState(now);
  return { s, now };
}
function finish(s, now) {
  R.recomputeStatuses(s, now);
  return R.checkIntegrity(s);
}
const MIN = 60000;

console.log('\nDemo data');
{
  const { s, now } = fresh();
  const issues = finish(s, now);
  check('Demo data passes integrity checks', issues.length === 0, issues.join(' | '));
}

console.log('\n1-4. 180 meals split across five riders of capacity 40');
{
  const { s, now } = fresh();
  const res = S.scenarioCapacitySplit(s, now);
  const batch = s.batches.find((b) => b.quantity === 180);
  const asg = s.assignments.filter((a) => a.batchId === batch.id);
  check('Scenario succeeded', res.ok, JSON.stringify(res.steps));
  check('180-meal batch created', !!batch && batch.quantity === 180);
  check('Split is 40/40/40/40/20', asg.map((a) => a.qty).sort((x, y) => y - x).join(',') === '40,40,40,40,20', asg.map((a) => a.qty).join(','));
  check('No rider exceeds capacity', asg.every((a) => a.qty <= E.getRider(s, a.riderId).capacity));
  check('Each rider used once', new Set(asg.map((a) => a.riderId)).size === asg.length);
  check('No duplicate quantity (reserved 180, available 0)', batch.qty.reserved === 180 && batch.qty.available === 0);
  const again = R.dispatchBatch(s, now, batch.id);
  check('Second dispatch of same batch is blocked', !again.ok, again.reason);
  const issues = finish(s, now);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
}

console.log('\n5-8. Ghost rider: timeout, safe release, reassignment');
{
  const { s, now } = fresh();
  const res = S.scenarioGhostRider(s, now);
  const ghost = s.riders.find((r) => r.ghost);
  const timedOut = s.assignments.find((a) => a.riderId === ghost.id && a.status === 'Timed Out');
  check('Scenario succeeded', res.ok, JSON.stringify(res.steps));
  check('Reservation marked Timed Out', !!timedOut);
  check('Ghost rider now Unresponsive and excluded', ghost.status === 'Unresponsive' && ghost.excludedBatches.includes(timedOut.batchId));
  const re = s.assignments.filter((a) => a.batchId === timedOut.batchId && a.status === 'Awaiting Ack' && a.riderId !== ghost.id);
  check('Quantity reassigned to another rider', re.length > 0 && re.reduce((x, a) => x + a.qty, 0) >= 1);
  // Collected cargo must NOT be released
  const kabir = s.assignments.find((a) => a.id === 'ASG-2002');
  const b3 = E.getBatch(s, 'B-1003');
  const before = { ...b3.qty };
  const t = R.timeoutReservation(s, now, kabir.id, { manual: true });
  check('Timeout on collected cargo is refused', !t.ok && b3.qty.available === before.available && b3.qty.collected === before.collected);
  // Auto timeout via processTick
  const pending = re[0];
  const tick = R.processTick(s, pending.ackDeadline + 1000);
  check('processTick auto-times-out expired acknowledgments', tick.changed && E.getAssignment(s, pending.id).status === 'Timed Out');
  const issues = finish(s, now);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
}

console.log('\n9-11. Shelter A demand drops to zero mid-route');
{
  const { s, now } = fresh();
  const res = S.scenarioShelterClosure(s, now, 'demand');
  const a = E.getAssignment(s, 'ASG-2002');
  check('Scenario succeeded', res.ok, JSON.stringify(res.steps));
  check('Kabir rerouted away from Shelter A', a.shelterId !== 'SH-A' && a.reroutedFrom === 'SH-A', a.shelterId);
  const sh = E.getShelter(s, a.shelterId);
  check('New shelter is open and accepts meals', sh.status === 'Open' && (sh.demand['Cooked meals'] ?? 0) >= a.qty);
  check('Still In Transit', a.status === 'In Transit');
  const issues = finish(s, now);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
}
{
  const { s, now } = fresh();
  // Remove every alternative: all other shelters have zero meal demand
  for (const sh of s.shelters) if (sh.id !== 'SH-A') sh.demand['Cooked meals'] = 0;
  S.scenarioShelterClosure(s, now, 'close');
  const a = E.getAssignment(s, 'ASG-2002');
  check('No safe alternative → At Risk (not forced)', a.status === 'At Risk' && a.shelterId === 'SH-A');
  check('Urgent alert raised', s.alerts.some((x) => !x.resolved && x.assignmentId === a.id));
  const del = R.completeDelivery(s, now, a.id);
  check('Delivery to closed shelter blocked', !del.ok);
  // Operator frees demand at Shelter B then retries
  E.getShelter(s, 'SH-B').demand['Cooked meals'] = 50;
  const retry = R.resolveAtRisk(s, now, a.id, 'retry');
  check('Retry reroute succeeds after demand appears', retry.ok && a.shelterId === 'SH-B' && a.status === 'In Transit');
  const ok = R.completeDelivery(s, now, a.id);
  check('Delivery completes at new shelter', ok.ok && a.status === 'Delivered');
  const dup = R.completeDelivery(s, now, a.id);
  check('Duplicate delivery blocked', !dup.ok);
  const issues = finish(s, now);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
}

console.log('\n12-13. Expiry violation');
{
  const { s, now } = fresh();
  const res = S.scenarioExpiryViolation(s, now);
  const batch = s.batches[0];
  check('Scenario succeeded (dispatch blocked)', res.ok, JSON.stringify(res.steps));
  check('No reservation created for short-life batch', !s.assignments.some((a) => a.batchId === batch.id));
  check('Block explains reason', res.steps.some((x) => x.text.includes('Unsafe dispatch blocked')));
  // Expired batch cannot be dispatched at all
  const later = batch.expiresAt + MIN;
  R.processTick(s, later);
  check('Batch expires and stock moves to spoiled', batch.qty.available === 0 && batch.qty.spoiled === 50);
  const d = R.dispatchBatch(s, later, batch.id);
  check('Dispatch of expired batch blocked', !d.ok);
  const issues = finish(s, later);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
}

console.log('\n14-15. Compatibility enforcement');
{
  const { s, now } = fresh();
  const res = S.scenarioResourceDependency(s, now);
  check('Scenario succeeded (rejected)', res.ok, JSON.stringify(res.steps));
  check('Reason mentions clean water', res.steps.some((x) => x.text.toLowerCase().includes('clean water')));
  check('Reason mentions cooking fuel', res.steps.some((x) => x.text.toLowerCase().includes('cooking fuel')));
  const batch = s.batches[0];
  const plan = E.planDispatch(s, batch.id, now);
  check('Engine never routes ration kits to Shelter C', plan.allocations.every((a) => a.shelterId !== 'SH-C'));
  const infant = E.getBatch(s, 'B-1005');
  const ip = E.planDispatch(s, infant.id, now);
  check('Infant formula only to shelters with water + sterile prep', ip.allocations.every((a) => ['SH-B', 'SH-D'].includes(a.shelterId)));
  const med = E.planDispatch(s, 'B-1006', now);
  check('Cold-chain medicine only to shelters with refrigeration + medical staff', med.allocations.every((a) => a.shelterId === 'SH-D'));
}

console.log('\nFull lifecycle + persistence round-trip');
{
  const { s, now } = fresh();
  const d = R.dispatchBatch(s, now, 'B-1001');
  check('Large batch dispatched', d.ok);
  const a = d.created[0];
  check('Pickup blocked before acknowledgment', !R.completePickup(s, now, a.id).ok);
  check('Acknowledge', R.acknowledge(s, now, a.id).ok);
  check('Pickup', R.completePickup(s, now, a.id).ok);
  check('Release after pickup refused', !R.cancelAssignment(s, now, a.id).ok);
  check('Start delivery', R.startDelivery(s, now, a.id).ok);
  const sh = E.getShelter(s, a.shelterId);
  const demandBefore = sh.demand['Cooked meals'];
  check('Complete delivery', R.completeDelivery(s, now, a.id).ok);
  check('Shelter demand reduced', sh.demand['Cooked meals'] === demandBefore - a.qty);
  const json = JSON.parse(JSON.stringify(s));
  check('State survives JSON save/load (LocalStorage)', JSON.stringify(json) === JSON.stringify(s));
  const issues = finish(s, now);
  check('Integrity holds', issues.length === 0, issues.join(' | '));
  const dupRider = R.createAssignment(s, now, { batchId: 'B-1001', riderId: d.created[1].riderId, shelterId: 'SH-D', qty: 1 });
  check('Rider with active assignment cannot get a second one', !dupRider.ok);
}

console.log('\nAll scenarios back-to-back on one state');
{
  const { s, now } = fresh();
  const all = [
    S.scenarioUrgentDonation(s, now),
    S.scenarioCapacitySplit(s, now),
    S.scenarioGhostRider(s, now),
    S.scenarioShelterClosure(s, now, 'demand'),
    S.scenarioNewDonationReceived(s, now),
    S.scenarioExpiryViolation(s, now),
    S.scenarioResourceDependency(s, now),
    S.scenarioShelterClosure(s, now, 'close'),
  ];
  all.forEach((x, i) => check(`Scenario run ${i + 1} (${x.title})`, x.ok, JSON.stringify(x.steps.filter((y) => !y.ok))));
  R.processTick(s, now + 3 * 60 * MIN);
  const issues = finish(s, now + 3 * 60 * MIN);
  check('Integrity holds after everything + 3h of expiry', issues.length === 0, issues.join(' | '));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
