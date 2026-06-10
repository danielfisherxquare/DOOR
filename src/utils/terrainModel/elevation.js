function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function quantile(sortedValues, ratio) {
  if (!sortedValues.length) return null
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * ratio)),
  )
  return sortedValues[index]
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  return quantile(sorted, 0.5)
}

function getNeighborValues(values, rows, cols, row, col, radius = 1) {
  const neighbors = []
  for (let nextRow = Math.max(0, row - radius); nextRow <= Math.min(rows - 1, row + radius); nextRow += 1) {
    for (let nextCol = Math.max(0, col - radius); nextCol <= Math.min(cols - 1, col + radius); nextCol += 1) {
      if (nextRow === row && nextCol === col) continue
      const value = values[nextRow * cols + nextCol]
      if (Number.isFinite(value)) neighbors.push(value)
    }
  }
  return neighbors
}

export function sanitizeElevationSeries(values, options = {}) {
  const rawValues = Array.isArray(values) ? values.map(toFiniteNumber) : []
  const missingCount = rawValues.filter((value) => !Number.isFinite(value)).length
  const finite = rawValues.filter(Number.isFinite).slice().sort((a, b) => a - b)
  const nonZero = finite.filter((value) => Math.abs(value) > 1).sort((a, b) => a - b)
  const referenceMedian = Number.isFinite(options.referenceMedian)
    ? options.referenceMedian
    : median(nonZero.length ? nonZero : finite)
  const zeroCount = finite.filter((value) => Math.abs(value) <= 1).length
  const zeroAsNoData = options.zeroAsNoData ?? (
    Number.isFinite(referenceMedian)
      && referenceMedian > 500
      && zeroCount > 0
  )
  const hardMin = Number.isFinite(options.hardMinMeters) ? options.hardMinMeters : -500
  const hardMax = Number.isFinite(options.hardMaxMeters) ? options.hardMaxMeters : 8850

  const prelim = rawValues.map((value) => {
    if (!Number.isFinite(value)) return null
    if (zeroAsNoData && Math.abs(value) <= 1) return null
    if (value < hardMin || value > hardMax) return null
    return value
  })
  const prelimFinite = prelim.filter(Number.isFinite).slice().sort((a, b) => a - b)
  const q1 = quantile(prelimFinite, 0.25)
  const q3 = quantile(prelimFinite, 0.75)
  const iqr = Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : 0
  const fence = Math.max(250, iqr * 3)
  const lowerBound = Number.isFinite(q1) ? q1 - fence : hardMin
  const upperBound = Number.isFinite(q3) ? q3 + fence : hardMax

  let invalidCount = 0
  const cleaned = prelim.map((value, index) => {
    if (!Number.isFinite(value)) {
      if (Number.isFinite(rawValues[index])) invalidCount += 1
      return null
    }
    if (value < lowerBound || value > upperBound) {
      invalidCount += 1
      return null
    }
    return value
  })

  return {
    values: cleaned,
    invalidCount,
    missingCount,
    totalCount: rawValues.length,
    zeroAsNoData,
    lowerBoundMeters: lowerBound,
    upperBoundMeters: upperBound,
    rawMinElevationMeters: quantile(finite, 0),
    rawMaxElevationMeters: finite.length ? finite[finite.length - 1] : null,
  }
}

export function fillMissingElevationGrid(values, rows, cols, fallbackValues = []) {
  // `fallbackValues` may be an array or a lazy `(index) => value` resolver, so
  // callers can avoid materializing an expensive full-grid fallback (e.g. the
  // track IDW) when only a handful of cells — or none — actually need it.
  const resolveFallback = typeof fallbackValues === 'function'
    ? fallbackValues
    : (index) => fallbackValues[index]
  let filled = values.slice()
  const fallbackMedian = typeof fallbackValues === 'function'
    ? (median(filled) ?? 0)
    : (median(fallbackValues) ?? median(filled) ?? 0)
  const maxPasses = rows + cols

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let filledThisPass = 0
    const next = filled.slice()
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col
        if (Number.isFinite(filled[index])) continue
        const neighbors = getNeighborValues(filled, rows, cols, row, col, 1)
        if (neighbors.length) {
          next[index] = neighbors.reduce((total, value) => total + value, 0) / neighbors.length
          filledThisPass += 1
        }
      }
    }
    filled = next
    // Stop as soon as a pass makes no progress: the finite set is unchanged, so
    // every later pass would also fill nothing. This yields the exact same grid
    // as iterating all rows+cols passes (no accuracy loss) while avoiding the
    // worst-case stall when a region is unreachable (e.g. a mostly-NoData DEM).
    if (filledThisPass === 0) break
  }

  return filled.map((value, index) => {
    if (Number.isFinite(value)) return value
    const fallback = resolveFallback(index)
    if (Number.isFinite(fallback)) return fallback
    return fallbackMedian
  })
}

export function removeLocalElevationSpikes(values, rows, cols, options = {}) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  const q05 = quantile(sorted, 0.05) ?? 0
  const q25 = quantile(sorted, 0.25) ?? q05
  const q75 = quantile(sorted, 0.75) ?? q25
  const q95 = quantile(sorted, 0.95) ?? q75
  const localThreshold = Number.isFinite(options.localThresholdMeters)
    ? options.localThresholdMeters
    : Math.max(160, (q75 - q25) * 1.2, (q95 - q05) * 0.22)
  // Ridge-preserving mode: a genuine ridge/peak shares its height with at least one
  // neighbour (the ridge continues), so it sits inside the neighbour value range. A
  // true single-cell DEM artifact pokes out beyond the ENTIRE neighbourhood. Flagging
  // only cells that exceed the neighbour min/max by the threshold keeps sharp ridges
  // and deep gullies while still scrubbing isolated spikes/pits — vs the default
  // median-deviation rule which flattens real rugged terrain.
  const preserveRidges = Boolean(options.preserveRidges)
  const cleaned = values.slice()
  let spikeCount = 0

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const value = values[index]
      const neighbors = getNeighborValues(values, rows, cols, row, col, 1)
      if (!Number.isFinite(value) || neighbors.length < 3) continue
      const neighborMedian = median(neighbors)
      if (!Number.isFinite(neighborMedian)) continue
      let isSpike
      if (preserveRidges) {
        const neighborMax = Math.max(...neighbors)
        const neighborMin = Math.min(...neighbors)
        isSpike = (value - neighborMax > localThreshold) || (neighborMin - value > localThreshold)
      } else {
        isSpike = Math.abs(value - neighborMedian) > localThreshold
      }
      if (isSpike) {
        cleaned[index] = neighborMedian
        spikeCount += 1
      }
    }
  }

  return { values: cleaned, spikeCount, localThresholdMeters: localThreshold, preserveRidges }
}

export function smoothElevationGrid(values, rows, cols, passes = 0) {
  let smoothed = values.slice()
  const passCount = Math.max(0, Math.round(Number(passes) || 0))
  for (let pass = 0; pass < passCount; pass += 1) {
    const next = smoothed.slice()
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col
        const neighbors = getNeighborValues(smoothed, rows, cols, row, col, 1)
        if (!neighbors.length) continue
        const average = neighbors.reduce((total, value) => total + value, 0) / neighbors.length
        next[index] = smoothed[index] * 0.62 + average * 0.38
      }
    }
    smoothed = next
  }
  return smoothed
}

export function prepareElevationGrid(rawValues, rows, cols, fallbackValues = [], options = {}) {
  const sanitized = sanitizeElevationSeries(rawValues, options)
  const fallbackCount = sanitized.values.filter((value) => !Number.isFinite(value)).length
  const filled = fillMissingElevationGrid(sanitized.values, rows, cols, fallbackValues)
  const despiked = removeLocalElevationSpikes(filled, rows, cols, options)
  const values = smoothElevationGrid(despiked.values, rows, cols, options.smoothingPasses)
  const finite = values.filter(Number.isFinite).slice().sort((a, b) => a - b)

  return {
    values,
    quality: {
      invalidCount: sanitized.invalidCount,
      missingCount: sanitized.missingCount,
      fallbackCount,
      validSampleCount: Math.max(0, sanitized.totalCount - sanitized.invalidCount - sanitized.missingCount),
      localSpikeCount: despiked.spikeCount,
      totalCount: sanitized.totalCount,
      zeroAsNoData: sanitized.zeroAsNoData,
      smoothingPasses: Math.max(0, Math.round(Number(options.smoothingPasses) || 0)),
      localThresholdMeters: despiked.localThresholdMeters,
      rawMinElevationMeters: sanitized.rawMinElevationMeters,
      rawMaxElevationMeters: sanitized.rawMaxElevationMeters,
    },
    minElevationMeters: quantile(finite, 0) ?? 0,
    maxElevationMeters: finite.length ? finite[finite.length - 1] : 0,
  }
}
