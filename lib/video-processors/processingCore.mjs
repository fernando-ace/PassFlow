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

/** One asynchronous lane per processor; delivery never depends on display batching. */
export function createResultLane() {
  let busy = false
  let epoch = 0
  return {
    reset() { epoch += 1 },
    async run(work, deliver, failed, isCurrent = () => true) {
      if (busy) return false
      busy = true
      const current = epoch
      try {
        const result = await work()
        if (current === epoch && isCurrent() && result) deliver(result)
      } catch (error) {
        if (current === epoch && isCurrent()) failed(error)
      } finally {
        busy = false
      }
      return true
    },
  }
}

/** Feed presented/decoded frame numbers, never just an advancing playback clock. */
export function createFrameClock() {
  let mediaTime = null
  let capturedAt = null
  return {
    sample(time, now) {
      if (time === mediaTime) return null
      const healthy = capturedAt === null || (time > mediaTime && now - capturedAt <= 1_000)
      mediaTime = time
      capturedAt = now
      return { capturedAt: now, healthy }
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
