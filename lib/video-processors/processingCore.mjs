export function createSingleFlightGate() {
  let busy = false
  return {
    acquire() {
      if (busy) return false
      busy = true
      return true
    },
    release() {
      busy = false
    },
  }
}

export function resetVideoSource(processors, results) {
  results.clear()
  processors.forEach((processor) => processor.resetSession?.())
}

export function getContainedVideoRect(containerWidth, containerHeight, videoWidth, videoHeight) {
  if ([containerWidth, containerHeight, videoWidth, videoHeight].some((value) => value <= 0)) return null
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  return {
    scale,
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}
