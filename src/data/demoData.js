// Realistic demo data. All times are relative to "now" so the demo
// always looks live, no matter when it is started.
import { DEFAULT_SETTINGS } from './constants.js';
import { MINUTE } from '../utils/timeUtils.js';

export const STATE_VERSION = 3;

const HOUR = 60 * MINUTE;

function qty(available, reserved = 0, collected = 0, delivered = 0, spoiled = 0) {
  return { available, reserved, collected, delivered, spoiled };
}

export function createDemoState(now = Date.now()) {
  const batches = [
    {
      id: 'B-1001',
      donor: 'Sunrise Banquet Hall',
      category: 'Cooked meals',
      description: 'Wedding banquet surplus — veg biryani, dal and rotis',
      quantity: 150,
      unit: 'meals',
      pickupLocation: 'Sunrise Banquet Hall, Ring Road',
      preparedAt: now - 1 * HOUR,
      expiresAt: now + 4 * HOUR,
      pickupMins: 10,
      deliveryMins: 25,
      storage: 'Hot holding (above 60°C)',
      handling: 'Insulated carriers, keep covered',
      qty: qty(150),
      createdAt: now - 40 * MINUTE,
      cancelled: false,
      status: 'Available',
    },
    {
      id: 'B-1002',
      donor: 'GreenLeaf Restaurant',
      category: 'Cooked meals',
      description: 'Lunch service surplus — paneer curry and rice',
      quantity: 45,
      unit: 'meals',
      pickupLocation: 'GreenLeaf Restaurant, MG Road',
      preparedAt: now - 2.5 * HOUR,
      expiresAt: now + 70 * MINUTE,
      pickupMins: 8,
      deliveryMins: 20,
      storage: 'Hot holding (above 60°C)',
      handling: 'Contains dairy — label allergens',
      qty: qty(45),
      createdAt: now - 25 * MINUTE,
      cancelled: false,
      status: 'Available',
    },
    {
      id: 'B-1003',
      donor: 'Campus Mess',
      category: 'Cooked meals',
      description: 'Hostel dinner prep surplus — khichdi and sabzi',
      quantity: 70,
      unit: 'meals',
      pickupLocation: 'Campus Mess, University Gate 2',
      preparedAt: now - 1.5 * HOUR,
      expiresAt: now + 2 * HOUR,
      pickupMins: 10,
      deliveryMins: 25,
      storage: 'Hot holding (above 60°C)',
      handling: 'Sealed food-grade containers',
      qty: qty(0, 0, 40, 30),
      createdAt: now - 2 * HOUR,
      cancelled: false,
      status: 'In Transit',
    },
    {
      id: 'B-1004',
      donor: 'Sunrise Banquet Hall',
      category: 'Dry ration kits',
      description: 'Rice, dal, oil and spice kits (raw — need cooking)',
      quantity: 60,
      unit: 'kits',
      pickupLocation: 'Sunrise Banquet Hall, Ring Road',
      preparedAt: now - 24 * HOUR,
      expiresAt: now + 30 * 24 * HOUR,
      pickupMins: 15,
      deliveryMins: 30,
      storage: 'Cool & dry',
      handling: 'Heavy — 8 kg per kit',
      qty: qty(40, 20),
      createdAt: now - 3 * HOUR,
      cancelled: false,
      status: 'Assigned',
    },
    {
      id: 'B-1005',
      donor: 'Community Pharmacy',
      category: 'Infant formula',
      description: 'Stage 1 infant formula, sealed tins',
      quantity: 24,
      unit: 'tins',
      pickupLocation: 'Community Pharmacy, Station Road',
      preparedAt: now - 48 * HOUR,
      expiresAt: now + 60 * 24 * HOUR,
      pickupMins: 5,
      deliveryMins: 20,
      storage: 'Cool & dry',
      handling: 'Needs clean water and sterile preparation area at shelter',
      qty: qty(24),
      createdAt: now - 90 * MINUTE,
      cancelled: false,
      status: 'Available',
    },
    {
      id: 'B-1006',
      donor: 'Community Pharmacy',
      category: 'Medical supplies',
      description: 'Insulin pens and cold-chain medicines',
      quantity: 30,
      unit: 'boxes',
      pickupLocation: 'Community Pharmacy, Station Road',
      preparedAt: now - 6 * HOUR,
      expiresAt: now + 18 * HOUR,
      pickupMins: 5,
      deliveryMins: 25,
      storage: 'Refrigerated (2–8°C)',
      handling: 'Cold box with ice packs; hand over to medical staff only',
      qty: qty(30),
      createdAt: now - 60 * MINUTE,
      cancelled: false,
      status: 'Available',
    },
    {
      id: 'B-1007',
      donor: 'Campus Mess',
      category: 'Essential kits',
      description: 'Hygiene kits — soap, toothpaste, sanitary pads',
      quantity: 40,
      unit: 'kits',
      pickupLocation: 'Campus Mess, University Gate 2',
      preparedAt: now - 72 * HOUR,
      expiresAt: now + 180 * 24 * HOUR,
      pickupMins: 10,
      deliveryMins: 20,
      storage: 'Ambient',
      handling: 'None',
      qty: qty(0, 0, 0, 40),
      createdAt: now - 5 * HOUR,
      cancelled: false,
      status: 'Delivered',
    },
  ];

  const riders = [
    { id: 'R-101', name: 'Priya Sharma', vehicle: 'Scooter', zone: 'Central', capacity: 40, load: 0, status: 'Available', reliability: 96, travelMins: 8, ghost: false, excludedBatches: [], currentAssignment: null, completed: 14 },
    { id: 'R-102', name: 'Rahul Verma', vehicle: 'Cargo van', zone: 'North', capacity: 60, load: 0, status: 'Available', reliability: 91, travelMins: 12, ghost: false, excludedBatches: [], currentAssignment: null, completed: 22 },
    { id: 'R-103', name: 'Kabir Singh', vehicle: 'Motorbike', zone: 'Riverside', capacity: 40, load: 40, status: 'Carrying', reliability: 88, travelMins: 10, ghost: false, excludedBatches: [], currentAssignment: 'ASG-2002', completed: 9 },
    { id: 'R-104', name: 'Meera Iyer', vehicle: 'Auto-rickshaw', zone: 'Station', capacity: 30, load: 0, status: 'Assigned', reliability: 93, travelMins: 9, ghost: false, excludedBatches: [], currentAssignment: 'ASG-2003', completed: 17 },
    { id: 'R-105', name: 'Arjun Nair', vehicle: 'Motorbike', zone: 'Central', capacity: 50, load: 0, status: 'Unresponsive', reliability: 58, travelMins: 6, ghost: true, excludedBatches: [], currentAssignment: null, completed: 3 },
    { id: 'R-106', name: 'Sana Khan', vehicle: 'Bicycle + trailer', zone: 'East', capacity: 25, load: 0, status: 'Available', reliability: 84, travelMins: 10, ghost: false, excludedBatches: [], currentAssignment: null, completed: 11 },
    { id: 'R-107', name: 'Vikram Rao', vehicle: 'Scooter', zone: 'Lakeside', capacity: 35, load: 0, status: 'Off Duty', reliability: 80, travelMins: 14, ghost: false, excludedBatches: [], currentAssignment: null, completed: 6 },
  ];

  const shelters = [
    {
      id: 'SH-A', code: 'A', name: 'Riverside Relief Camp', location: 'Riverside, Ward 4',
      travelMins: 18, capacity: 200, status: 'Open', received: 70,
      demand: { 'Cooked meals': 120, 'Dry ration kits': 30, 'Essential kits': 40 },
      resources: { cleanWater: true, cookingFuel: true, refrigeration: false, sterilePrep: false, medicalStaff: false },
    },
    {
      id: 'SH-B', code: 'B', name: 'Greenfield Night Shelter', location: 'Station Road',
      travelMins: 22, capacity: 150, status: 'Open', received: 0,
      demand: { 'Cooked meals': 80, 'Dry ration kits': 25, 'Infant formula': 20 },
      resources: { cleanWater: true, cookingFuel: true, refrigeration: true, sterilePrep: true, medicalStaff: false },
    },
    {
      id: 'SH-C', code: 'C', name: 'Ashray Transit Camp', location: 'Industrial Belt East',
      travelMins: 15, capacity: 120, status: 'Open', received: 0,
      demand: { 'Cooked meals': 40, 'Dry ration kits': 60, 'Medical supplies': 50, 'Essential kits': 30 },
      resources: { cleanWater: false, cookingFuel: false, refrigeration: false, sterilePrep: false, medicalStaff: true },
    },
    {
      id: 'SH-D', code: 'D', name: 'Northgate Flood Relief Camp', location: 'Northgate',
      travelMins: 35, capacity: 250, status: 'Open', received: 30,
      demand: { 'Cooked meals': 100, 'Dry ration kits': 80, 'Infant formula': 15, 'Medical supplies': 40, 'Essential kits': 60 },
      resources: { cleanWater: true, cookingFuel: true, refrigeration: true, sterilePrep: true, medicalStaff: true },
    },
    {
      id: 'SH-E', code: 'E', name: 'Lakeside Community Kitchen', location: 'Lakeside',
      travelMins: 12, capacity: 80, status: 'Closed', received: 0,
      demand: { 'Cooked meals': 50 },
      resources: { cleanWater: true, cookingFuel: true, refrigeration: false, sterilePrep: false, medicalStaff: false },
    },
  ];

  const assignments = [
    {
      id: 'ASG-2001', reservationId: 'RSV-3001', batchId: 'B-1007', riderId: 'R-102', shelterId: 'SH-A',
      qty: 40, category: 'Essential kits', unit: 'kits', status: 'Delivered', tripMins: 40,
      createdAt: now - 4.5 * HOUR, ackDeadline: now - 4.4 * HOUR, ackAt: now - 4.45 * HOUR,
      pickedUpAt: now - 4.2 * HOUR, departedAt: now - 4.2 * HOUR, etaAt: now - 3.9 * HOUR, deliveredAt: now - 3.9 * HOUR,
      reroutedFrom: null, prevStatus: null,
    },
    {
      id: 'ASG-2002', reservationId: 'RSV-3002', batchId: 'B-1003', riderId: 'R-103', shelterId: 'SH-A',
      qty: 40, category: 'Cooked meals', unit: 'meals', status: 'In Transit', tripMins: 43,
      createdAt: now - 35 * MINUTE, ackDeadline: now - 33 * MINUTE, ackAt: now - 34 * MINUTE,
      pickedUpAt: now - 12 * MINUTE, departedAt: now - 10 * MINUTE, etaAt: now + 12 * MINUTE, deliveredAt: null,
      reroutedFrom: null, prevStatus: null,
    },
    {
      id: 'ASG-2003', reservationId: 'RSV-3003', batchId: 'B-1004', riderId: 'R-104', shelterId: 'SH-B',
      qty: 20, category: 'Dry ration kits', unit: 'kits', status: 'Acknowledged', tripMins: 51,
      createdAt: now - 6 * MINUTE, ackDeadline: now - 4 * MINUTE, ackAt: now - 5 * MINUTE,
      pickedUpAt: null, departedAt: null, etaAt: now + 45 * MINUTE, deliveredAt: null,
      reroutedFrom: null, prevStatus: null,
    },
    {
      id: 'ASG-2000', reservationId: 'RSV-3000', batchId: 'B-1003', riderId: 'R-102', shelterId: 'SH-D',
      qty: 30, category: 'Cooked meals', unit: 'meals', status: 'Delivered', tripMins: 62,
      createdAt: now - 2 * HOUR, ackDeadline: now - 1.95 * HOUR, ackAt: now - 1.97 * HOUR,
      pickedUpAt: now - 1.8 * HOUR, departedAt: now - 1.8 * HOUR, etaAt: now - 1.2 * HOUR, deliveredAt: now - 1.2 * HOUR,
      reroutedFrom: null, prevStatus: null,
    },
  ];

  const logs = [
    { type: 'Delivery started', description: 'Kabir Singh left Campus Mess with 40 meals for Shelter A · Riverside Relief Camp', batchId: 'B-1003', riderId: 'R-103', status: 'info', ago: 10 },
    { type: 'Rider acknowledgment', description: 'Meera Iyer accepted reservation RSV-3003 (20 dry ration kits → Shelter B)', batchId: 'B-1004', riderId: 'R-104', status: 'success', ago: 5 },
    { type: 'Donation created', description: 'GreenLeaf Restaurant listed 45 cooked meals (expires in ~1h 35m)', batchId: 'B-1002', riderId: null, status: 'info', ago: 25 },
    { type: 'Donation created', description: 'Sunrise Banquet Hall listed 150 cooked meals', batchId: 'B-1001', riderId: null, status: 'info', ago: 40 },
    { type: 'Reservation timeout', description: 'Arjun Nair did not acknowledge an earlier reservation; marked unresponsive', batchId: null, riderId: 'R-105', status: 'danger', ago: 55 },
    { type: 'Delivery completed', description: 'Rahul Verma delivered 30 meals to Shelter D · Northgate Flood Relief Camp', batchId: 'B-1003', riderId: 'R-102', status: 'success', ago: 72 },
    { type: 'Delivery completed', description: 'Rahul Verma delivered 40 hygiene kits to Shelter A · Riverside Relief Camp', batchId: 'B-1007', riderId: 'R-102', status: 'success', ago: 234 },
  ]
    .sort((a, b) => a.ago - b.ago)
    .map((l, i) => ({
      id: `LOG-${5000 - i}`,
      ts: now - l.ago * MINUTE,
      type: l.type,
      description: l.description,
      batchId: l.batchId,
      riderId: l.riderId,
      status: l.status,
    }));

  return {
    version: STATE_VERSION,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS },
    counters: { batch: 1007, assignment: 2003, reservation: 3003, log: 5000, alert: 7000, rider: 107 },
    batches,
    riders,
    shelters,
    assignments,
    logs,
    alerts: [],
  };
}
