export function colorDistanceSq(pixelA, pixelB) {
  const dr = pixelA[0] - pixelB[0]
  const dg = pixelA[1] - pixelB[1]
  const db = pixelA[2] - pixelB[2]
  return dr * dr + dg * dg + db * db
}

export function hexToRgb(hex) {
  const clean = String(hex || '#808080').replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  }
}

export function hexToRgbArray(hex) {
  const rgb = hexToRgb(hex)
  return [rgb.r, rgb.g, rgb.b]
}
