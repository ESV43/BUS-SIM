/* Pure, framework-free game rules shared by js/shuttle-game.js and the node
 * test suite. Everything here works on plain numbers/objects so it can run
 * without a browser (see test/game-logic.test.js). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IISERLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FARE_BASE = 10;   // ₹ flag fall
  const FARE_PER_KM = 15; // ₹ per kilometre of the passenger's own trip
  const NIGHT_FARE_MULTIPLIER = 1.5;

  // Straight-line distance between two BUS_STOPS entries ({x, z}).
  function stopDistance(stops, fromIdx, toIdx) {
    const a = stops[fromIdx], b = stops[toIdx];
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  function fareForStops(stops, fromIdx, toIdx) {
    const km = stopDistance(stops, fromIdx, toIdx) / 1000;
    return Math.max(FARE_BASE, Math.round(FARE_BASE + FARE_PER_KM * km));
  }

  // Every waiting passenger has somewhere to go; the fare follows from the pair.
  function pickDestination(fromIdx, stopCount, random) {
    const rnd = typeof random === 'function' ? random : Math.random;
    if (!stopCount || stopCount < 2) return fromIdx;
    let to = fromIdx;
    for (let tries = 0; tries < 8 && to === fromIdx; tries++) to = Math.floor(rnd() * stopCount);
    return to === fromIdx ? (fromIdx + 1) % stopCount : to;
  }

  // Position + heading at a fraction (0..1) along a polyline of [x, z] points.
  function samplePolylineAt(pts, fraction) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let target = total * fraction, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seg >= target && seg > 0.01) {
        const u = (target - acc) / seg;
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
          z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
          heading: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        };
      }
      acc += seg;
    }
    const last = pts[pts.length - 1];
    return { x: last[0], z: last[1], heading: 0 };
  }

  // Cabin comfort starts at 100 and loses points for rough driving.
  function comfortGrade(comfort) {
    const v = Math.max(0, Math.min(100, Number(comfort) || 0));
    if (v >= 90) return 'S';
    if (v >= 80) return 'A';
    if (v >= 70) return 'B';
    if (v >= 55) return 'C';
    return 'D';
  }

  // Night services pay a shift allowance.
  function fareMultiplier(isNight) {
    return isNight ? NIGHT_FARE_MULTIPLIER : 1;
  }

  return {
    FARE_BASE, FARE_PER_KM, NIGHT_FARE_MULTIPLIER,
    stopDistance, fareForStops, pickDestination, samplePolylineAt,
    comfortGrade, fareMultiplier
  };
});
