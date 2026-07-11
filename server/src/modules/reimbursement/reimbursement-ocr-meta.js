export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeRecordOcrMeta(existingMeta, key, nextMeta) {
  if (!nextMeta) return existingMeta || null;
  if (!isPlainObject(existingMeta)) return { [key]: nextMeta };

  const hasGroupedMeta = isPlainObject(existingMeta.invoice) || isPlainObject(existingMeta.payment);
  if (hasGroupedMeta) {
    return {
      ...existingMeta,
      [key]: nextMeta,
    };
  }

  const counterpartKey = key === 'invoice' ? 'payment' : 'invoice';
  return {
    [counterpartKey]: existingMeta,
    [key]: nextMeta,
  };
}
