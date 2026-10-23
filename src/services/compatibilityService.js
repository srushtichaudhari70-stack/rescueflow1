// Aid compatibility rules.
// A shelter can only receive an aid category if it has the resources
// needed to use that aid safely. Every rule explains itself so the UI can
// show WHY an assignment was rejected.
import { RESOURCES } from '../data/constants.js';

export function requiredResources(batch) {
  const rules = [];
  switch (batch.category) {
    case 'Dry ration kits':
      rules.push({ resource: 'cleanWater', why: 'Raw ration kits must be cooked with clean water' });
      rules.push({ resource: 'cookingFuel', why: 'Raw ration kits need cooking fuel to be usable' });
      break;
    case 'Infant formula':
      rules.push({ resource: 'cleanWater', why: 'Infant formula must be mixed with clean, boiled water' });
      rules.push({ resource: 'sterilePrep', why: 'Infant formula needs a sterile preparation area' });
      break;
    case 'Medical supplies':
      rules.push({ resource: 'medicalStaff', why: 'Medical supplies must be handed to medical staff' });
      break;
    default:
      break;
  }
  if (batch.storage && batch.storage.startsWith('Refrigerated')) {
    rules.push({ resource: 'refrigeration', why: 'Cold-chain items need refrigeration at the shelter' });
  }
  return rules;
}

export function describeRules(batch) {
  const rules = requiredResources(batch).map((r) => `${RESOURCES[r.resource]}: ${r.why.toLowerCase()}`);
  if (batch.category === 'Cooked meals') {
    rules.push('Must arrive before the safe expiry deadline (expiry minus safety buffer)');
  }
  return rules;
}

// Returns { ok, reasons[] } — checks operating status, accepted category and resources.
export function checkCompatibility(batch, shelter) {
  const reasons = [];
  if (shelter.status !== 'Open') {
    reasons.push('Shelter is closed');
  }
  if (!(batch.category in shelter.demand)) {
    reasons.push(`Does not accept ${batch.category.toLowerCase()}`);
  }
  for (const rule of requiredResources(batch)) {
    if (!shelter.resources[rule.resource]) {
      reasons.push(`Missing ${RESOURCES[rule.resource].toLowerCase()} — ${rule.why.toLowerCase()}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
