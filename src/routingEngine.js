// src/engine/routingEngine.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function directionFrom(start, end) {
  return end > start ? "Northbound" : "Southbound";
}

function inSegment(chainage, a, b, inclusiveEnd) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return inclusiveEnd ? (chainage > lo && chainage <= hi) : (chainage > lo && chainage < hi);
}

export function getNextFeature(startChainage, endChainage, features, config) {
  const { inclusiveEnd } = config;
  const northbound = endChainage > startChainage;

  const candidates = features.filter(f => {
    if (northbound) return f.chainage > startChainage && (inclusiveEnd ? f.chainage <= endChainage : f.chainage < endChainage);
    return f.chainage < startChainage && (inclusiveEnd ? f.chainage >= endChainage : f.chainage > endChainage);
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => northbound ? a.chainage - b.chainage : b.chainage - a.chainage);
  return candidates[0];
}

export function getRouteSummary(startChainage, endChainage, features, userConfig = {}) {
  const config = { ...userConfig };
  const {
    metresPerMile,
    defaultSpeedMph,
    minutesPerLock,
    inclusiveEnd,
    minChainage,
    maxChainage
  } = config;

  const start = clamp(startChainage, minChainage, maxChainage);
  const end = clamp(endChainage, minChainage, maxChainage);

  const distanceMetres = Math.abs(end - start);
  const distanceMiles = distanceMetres / metresPerMile;

  const lockCount = features.filter(f =>
    f.type === "lock" && inSegment(f.chainage, start, end, inclusiveEnd)
  ).length;

  const speedMph = config.speedMph ?? defaultSpeedMph;
  const cruisingHours = distanceMiles / speedMph;
  const lockHours = (lockCount * minutesPerLock) / 60;

  return {
    direction: directionFrom(start, end),
    startChainage: start,
    endChainage: end,
    distanceMiles,                 // number
    lockCount,
    etaHours: cruisingHours + lockHours, // number
    nextFeature: getNextFeature(start, end, features, config)
  };
}

export function getWindowFeatures(startChainage, direction, windowHours, speedMph, features, userConfig = {}) {
  const config = { ...userConfig };
  const { metresPerMile, minChainage, maxChainage } = config;

  const start = clamp(startChainage, minChainage, maxChainage);
  const windowMetres = speedMph * metresPerMile * windowHours;

  const northbound = direction === "Northbound";
  const rawLimit = northbound ? (start + windowMetres) : (start - windowMetres);
  const limit = clamp(rawLimit, minChainage, maxChainage);

  const items = features
    .filter(f => northbound
      ? (f.chainage > start && f.chainage <= limit)
      : (f.chainage < start && f.chainage >= limit)
    )
    .sort((a, b) => northbound ? a.chainage - b.chainage : b.chainage - a.chainage);

  return {
    direction,
    windowHours,
    speedMph,
    startChainage: start,
    limitChainage: limit,
    items
  };
}
