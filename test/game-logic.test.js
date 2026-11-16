'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/game-logic.js');

const STOPS = [
  { x: 0, z: 0 },
  { x: 3000, z: 4000 }, // 5 km away from stop 0
  { x: 100, z: 0 }
];

test('stopDistance measures straight-line metres', () => {
  assert.equal(L.stopDistance(STOPS, 0, 2), 100);
  assert.equal(L.stopDistance(STOPS, 0, 1), 5000);
  assert.equal(L.stopDistance(STOPS, 2, 2), 0);
});

test('fareForStops is ₹10 flag fall plus ₹15/km', () => {
  assert.equal(L.fareForStops(STOPS, 0, 1), 85);        // 5 km
  assert.equal(L.fareForStops(STOPS, 0, 2), 12);        // 0.1 km rounds up
  assert.equal(L.fareForStops(STOPS, 0, 0), L.FARE_BASE); // never below the flag fall
});

test('pickDestination always returns a different, valid stop', () => {
  for (let i = 0; i < 200; i++) {
    const from = i % STOPS.length;
    const to = L.pickDestination(from, STOPS.length);
    assert.ok(Number.isInteger(to));
    assert.ok(to >= 0 && to < STOPS.length);
    assert.notEqual(to, from);
  }
});

test('pickDestination falls back when the random source keeps repeating', () => {
  assert.equal(L.pickDestination(0, 3, () => 0), 1);
  assert.equal(L.pickDestination(2, 3, () => 0.99), 0);
  assert.equal(L.pickDestination(4, 1, () => 0.5), 4);
});

test('samplePolylineAt interpolates position and heading', () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  const start = L.samplePolylineAt(pts, 0);
  assert.equal(start.x, 0);
  assert.equal(start.z, 0);

  const middle = L.samplePolylineAt(pts, 0.5);
  assert.equal(middle.x, 10);
  assert.equal(middle.z, 0);
  assert.ok(Math.abs(middle.heading - Math.PI / 2) < 1e-9);

  const later = L.samplePolylineAt(pts, 0.75);
  assert.equal(later.x, 10);
  assert.equal(later.z, 5);
  assert.ok(Math.abs(later.heading) < 1e-9);

  const end = L.samplePolylineAt(pts, 1);
  assert.deepEqual(end, { x: 10, z: 10, heading: 0 });
});

test('comfortGrade maps comfort points to S–D', () => {
  assert.equal(L.comfortGrade(100), 'S');
  assert.equal(L.comfortGrade(90), 'S');
  assert.equal(L.comfortGrade(89), 'A');
  assert.equal(L.comfortGrade(80), 'A');
  assert.equal(L.comfortGrade(79), 'B');
  assert.equal(L.comfortGrade(70), 'B');
  assert.equal(L.comfortGrade(69), 'C');
  assert.equal(L.comfortGrade(55), 'C');
  assert.equal(L.comfortGrade(54), 'D');
  assert.equal(L.comfortGrade(-20), 'D');
  assert.equal(L.comfortGrade(NaN), 'D');
});

test('night shift pays a 50% fare allowance', () => {
  assert.equal(L.fareMultiplier(true), 1.5);
  assert.equal(L.fareMultiplier(false), 1);
  assert.equal(L.NIGHT_FARE_MULTIPLIER, 1.5);
});
