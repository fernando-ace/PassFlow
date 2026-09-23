export class QrValueDebouncer {
  /** @type {Map<string, number>} */
  lastSeenByValue = new Map()

  /** @param {number} cooldownMs */
  constructor(cooldownMs = 8_000) {
    this.cooldownMs = cooldownMs
  }

  /**
   * @param {string} value
   * @param {number} now
   */
  shouldProcess(value, now = Date.now()) {
    const lastSeenAt = this.lastSeenByValue.get(value)
    if (lastSeenAt !== undefined && now - lastSeenAt < this.cooldownMs) {
      return false
    }
    this.lastSeenByValue.set(value, now)

    if (this.lastSeenByValue.size > 100) {
      const expiry = now - this.cooldownMs
      for (const [seenValue, seenAt] of this.lastSeenByValue) {
        if (seenAt <= expiry) this.lastSeenByValue.delete(seenValue)
      }
    }
    return true
  }

  reset() {
    this.lastSeenByValue.clear()
  }
}
