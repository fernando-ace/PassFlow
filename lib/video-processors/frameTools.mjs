/** Copy a crop at native resolution; returned offsets map boxes back to the stream. */
export function cropFrame(frame, box, padding = 0.4) {
  const x = Math.max(0, Math.floor(box.x - box.width * padding))
  const y = Math.max(0, Math.floor(box.y - box.height * padding))
  const width = Math.min(frame.width - x, Math.ceil(box.width * (1 + padding * 2)))
  const height = Math.min(frame.height - y, Math.ceil(box.height * (1 + padding * 2)))
  if (width <= 0 || height <= 0) return null
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * frame.width + x) * 4
    data.set(frame.data.subarray(start, start + width * 4), row * width * 4)
  }
  return { frame: { data, width, height }, x, y }
}

export function boxesOverlap(a, b) {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height)) > 0.35
}
