import jsQR from 'jsqr'

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
