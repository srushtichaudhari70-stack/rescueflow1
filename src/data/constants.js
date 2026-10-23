export const CATEGORIES = [
  'Cooked meals',
  'Dry ration kits',
  'Infant formula',
  'Medical supplies',
  'Essential kits',
];

export const DEFAULT_UNITS = {
  'Cooked meals': 'meals',
  'Dry ration kits': 'kits',
  'Infant formula': 'tins',
  'Medical supplies': 'boxes',
  'Essential kits': 'kits',
};

export const STORAGE_OPTIONS = [
  'Ambient',
  'Hot holding (above 60°C)',
  'Refrigerated (2–8°C)',
  'Cool & dry',
];

export const DONORS = [
  'Sunrise Banquet Hall',
  'GreenLeaf Restaurant',
  'Campus Mess',
  'Community Pharmacy',
];

export const RESOURCES = {
  cleanWater: 'Clean water',
  cookingFuel: 'Cooking fuel',
  refrigeration: 'Refrigeration',
  sterilePrep: 'Sterile prep area',
  medicalStaff: 'Medical staff',
};

// Points (out of 15) used by the priority score. Higher = more critical aid.
export const CATEGORY_CRITICALITY = {
  'Infant formula': { points: 15, why: 'Infants have no safe substitute' },
  'Medical supplies': { points: 15, why: 'Health-critical supplies' },
  'Cooked meals': { points: 12, why: 'Highly perishable, feeds people today' },
  'Dry ration kits': { points: 6, why: 'Long shelf-life, needs cooking at shelter' },
  'Essential kits': { points: 4, why: 'Non-perishable support items' },
};

export const DEFAULT_SETTINGS = {
  safetyBufferMins: 15, // food must arrive at least this many minutes before expiry
  ackTimeoutSecs: 120, // rider must acknowledge within this time
  handlingMins: 5, // handover time at the shelter
};
