export class QrValueDebouncer {
  /** @type {string | null} */
  lastValue = null

  lastSeenAt = 0

  /** @param {number} cooldownMs */
  constructor(cooldownMs = 8_000) {
    this.cooldownMs = cooldownMs
  }

  /**
   * @param {string} value
   * @param {number} now
   */
  shouldProcess(value, now = Date.now()) {
    if (value === this.lastValue && now - this.lastSeenAt < this.cooldownMs) {
      return false
    }
    this.lastValue = value
    this.lastSeenAt = now
    return true
  }
}
