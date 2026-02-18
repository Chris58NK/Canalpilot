// engine.js — CanalPilot proof-of-concept engine

export const corridor = {
  id: "test_corridor",
  length: 3200, // meters
  features: [
    { type: "lock", name: "Lock A", chainage: 800 },
    { type: "lock", name: "Lock B", chainage: 1600 },
    { type: "winding", name: "Winding Hole", chainage: 2400 },
    { type: "lock", name: "Lock C", chainage: 3200 }
  ]
};

export function getNextFeature(start, end) {
  const northbound = end > start;

  const candidates = corridor.features.filter(f =>
    northbound ? f.chainage > start : f.chainage < start
  );

  if (candidates.length === 0) return null;

  return northbound
    ? candidates.sort((a, b) => a.chainage - b.chainage)[0]
    : candidates.sort((a, b) => b.chainage - a.chainage)[0];
}

export function calculateRoute(start, end, speedMph = 3, minutesPerLock = 8) {
  const distanceMeters = Math.abs(end - start);
  const distanceMiles = distanceMeters / 1609.344;

  const locks = corridor.features.filter(f =>
    f.type === "lock" &&
    f.chainage > Math.min(start, end) &&
    f.chainage <= Math.max(start, end)
  );

  const cruisingHours = distanceMiles / speedMph;
  const lockHours = (locks.length * minutesPerLock) / 60;

  return {
    direction: end > start ? "Northbound" : "Southbound",
    startChainage: start,
    endChainage: end,
    distanceMiles: distanceMiles.toFixed(2),
    lockCount: locks.length,
    etaHours: (cruisingHours + lockHours).toFixed(2),
    nextFeature: getNextFeature(start, end)
  };
}

export function featuresWithinHours(start, end, hours, speedMph) {
  const northbound = end > start;
  const rangeMeters = speedMph * 1609.344 * hours;
  const limit = northbound ? (start + rangeMeters) : (start - rangeMeters);

  const items = corridor.features.filter(f =>
    northbound
      ? (f.chainage > start && f.chainage <= limit)
      : (f.chainage < start && f.chainage >= limit)
  );

  items.sort((a, b) =>
    northbound ? a.chainage - b.chainage : b.chainage - a.chainage
  );

  return {
    direction: northbound ? "Northbound" : "Southbound",
    windowHours: hours,
    speedMph,
    startChainage: start,
    limitChainage: limit,
    items
  };
}
