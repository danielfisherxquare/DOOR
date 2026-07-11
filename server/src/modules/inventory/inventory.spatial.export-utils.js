export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function pickNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

export function round(value, digits = 4) {
  return Number(pickNumber(value, 0).toFixed(digits));
}
