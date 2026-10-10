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
  let low = 0
  let high = 255
  if (contrast) {
    const histogram = new Uint32Array(256)
    for (let i = 0; i < frame.data.length; i += 4) {
      const gray = Math.round(frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114)
      histogram[gray] += 1
    }
    const pixels = frame.width * frame.height
    const lowTarget = pixels * 0.02
    const highTarget = pixels * 0.98
    let count = 0
    for (let value = 0; value < 256; value += 1) {
      count += histogram[value]
      if (count >= lowTarget) { low = value; break }
    }
    count = 0
    for (let value = 0; value < 256; value += 1) {
      count += histogram[value]
      if (count >= highTarget) { high = value; break }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (Math.min(frame.height - 1, Math.floor(y / scale)) * frame.width
        + Math.min(frame.width - 1, Math.floor(x / scale))) * 4
      const dst = (y * width + x) * 4
      if (contrast) {
        const gray = frame.data[src] * 0.299 + frame.data[src + 1] * 0.587 + frame.data[src + 2] * 0.114
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

/** Global Otsu thresholding helps recover screen codes under glare and low contrast. */
export function thresholdQrFrame(frame) {
  const histogram = new Uint32Array(256)
  const pixels = frame.width * frame.height
  let total = 0
  for (let i = 0; i < frame.data.length; i += 4) {
    const gray = Math.round(frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114)
    histogram[gray] += 1
    total += gray
  }

  let backgroundWeight = 0
  let backgroundSum = 0
  let bestVariance = -1
  let threshold = 127
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value]
    if (!backgroundWeight) continue
    const foregroundWeight = pixels - backgroundWeight
    if (!foregroundWeight) break
    backgroundSum += value * histogram[value]
    const meanBackground = backgroundSum / backgroundWeight
    const meanForeground = (total - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = value
    }
  }

  const data = new Uint8ClampedArray(frame.data.length)
  for (let i = 0; i < frame.data.length; i += 4) {
    const gray = frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114
    const value = gray < threshold ? 0 : 255
    data[i] = data[i + 1] = data[i + 2] = value
    data[i + 3] = 255
  }
  return { data, width: frame.width, height: frame.height }
}

/** At most five attempts, each capped at 1.5M pixels. Crops rotate across samples. */
export function decodeQrFrameRobust(frame, sample = 0) {
  const scale = Math.min(1, Math.sqrt(1_500_000 / (frame.width * frame.height)))
  const base = scale === 1 ? frame : scaleQrFrame(frame, scale)
  let decoded = decodeQrFrame(base)
  if (!decoded) decoded = decodeQrFrame(scaleQrFrame(base, 1, true))
  if (!decoded) decoded = decodeQrFrame(thresholdQrFrame(base))
  let offsetX = 0
  let offsetY = 0
  let attemptScale = 1
  if (!decoded) {
    const index = sample % 7
    const box = index < 4
      ? { x: (index % 2) * base.width * 0.35, y: Math.floor(index / 2) * base.height * 0.35,
          width: base.width * 0.65, height: base.height * 0.65 }
      : index === 4
        ? { x: base.width * 0.15, y: 0, width: base.width * 0.7, height: base.height }
        : index === 5
          ? { x: base.width * 0.14, y: base.height * 0.14, width: base.width * 0.72, height: base.height * 0.72 }
          : { x: 0, y: base.height * 0.15, width: base.width, height: base.height * 0.7 }
    const crop = cropFrame(base, box, 0)
    if (crop) {
      offsetX = crop.x
      offsetY = crop.y
      attemptScale = Math.min(2, Math.sqrt(1_500_000 / (crop.frame.width * crop.frame.height)))
      decoded = decodeQrFrame(scaleQrFrame(crop.frame, attemptScale))
      if (!decoded) decoded = decodeQrFrame(thresholdQrFrame(scaleQrFrame(crop.frame, attemptScale)))
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
