import jsQR from 'jsqr'
import { cropFrame } from './frameTools.mjs'

/**
 * Decode a QR value and its bounding box from the same ImageData shape used by
 * both the Ring frame processor and the development harness.
 * @param {ImageData} frame
 */
export function decodeQrFrame(frame) {
  const code = jsQR(frame.data, frame.width, frame.height, {
    inversionAttempts: 'attemptBoth',
  })
  if (!code) return null

  const corners = [
    code.location.topLeftCorner,
    code.location.topRightCorner,
    code.location.bottomRightCorner,
    code.location.bottomLeftCorner,
  ]
  const xValues = corners.map((corner) => corner.x)
  const yValues = corners.map((corner) => corner.y)
  const left = Math.min(...xValues)
  const top = Math.min(...yValues)

  return {
    value: code.data,
    boundingBox: {
      x: left,
      y: top,
      width: Math.max(...xValues) - left,
      height: Math.max(...yValues) - top,
    },
  }
}

export function scaleQrFrame(frame, scale, contrast = false) {
  const width = Math.max(1, Math.round(frame.width * scale))
  const height = Math.max(1, Math.round(frame.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  let low = 255
  let high = 0
  if (contrast) {
    for (let i = 0; i < frame.data.length; i += 4) {
      const gray = (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3
      low = Math.min(low, gray)
      high = Math.max(high, gray)
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (Math.min(frame.height - 1, Math.floor(y / scale)) * frame.width
        + Math.min(frame.width - 1, Math.floor(x / scale))) * 4
      const dst = (y * width + x) * 4
      if (contrast) {
        const gray = (frame.data[src] + frame.data[src + 1] + frame.data[src + 2]) / 3
        data[dst] = data[dst + 1] = data[dst + 2] = (gray - low) * 255 / Math.max(1, high - low)
      } else {
        data[dst] = frame.data[src]
        data[dst + 1] = frame.data[src + 1]
        data[dst + 2] = frame.data[src + 2]
      }
      data[dst + 3] = 255
    }
  }
  return { data, width, height }
}

/** At most four attempts, each capped at 1.5M pixels. Quadrants rotate across samples. */
export function decodeQrFrameRobust(frame, sample = 0) {
  const scale = Math.min(1, Math.sqrt(1_500_000 / (frame.width * frame.height)))
  const base = scale === 1 ? frame : scaleQrFrame(frame, scale)
  let decoded = decodeQrFrame(base)
  if (!decoded) decoded = decodeQrFrame(scaleQrFrame(base, 1, true))
  let offsetX = 0
  let offsetY = 0
  let attemptScale = 1
  if (!decoded) {
    const index = sample % 5
    const box = index === 0
      ? { x: base.width * 0.15, y: 0, width: base.width * 0.7, height: base.height }
      : { x: ((index - 1) % 2) * base.width * 0.35, y: Math.floor((index - 1) / 2) * base.height * 0.35,
          width: base.width * 0.65, height: base.height * 0.65 }
    const crop = cropFrame(base, box, 0)
    if (crop) {
      offsetX = crop.x
      offsetY = crop.y
      attemptScale = Math.min(2, Math.sqrt(1_500_000 / (crop.frame.width * crop.frame.height)))
      decoded = decodeQrFrame(scaleQrFrame(crop.frame, attemptScale))
      if (!decoded) decoded = decodeQrFrame(scaleQrFrame(crop.frame, attemptScale, true))
    }
  }
  if (!decoded) return null
  const box = decoded.boundingBox
  return { value: decoded.value, boundingBox: {
    x: (offsetX + box.x / attemptScale) / scale,
    y: (offsetY + box.y / attemptScale) / scale,
    width: box.width / attemptScale / scale,
    height: box.height / attemptScale / scale,
  } }
}
