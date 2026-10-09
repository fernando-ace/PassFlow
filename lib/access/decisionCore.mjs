import { ACCESS_CONFIG } from './config.mjs'

export const ACCESS_OUTCOME = Object.freeze({
  waiting: 'waiting-for-credential',
  checking: 'checking-credential',
  credentialReady: 'credential-verified-waiting-for-entry',
  authorized: 'authorized-entry',
  tailgating: 'possible-tailgating',
  unauthorized: 'unauthorized-entry',
})

/**
 * Stateful access policy fed by verified credentials and directional crossing
 * events. It intentionally knows nothing about Ring, QR decoding, or CV models.
 */
export class AccessDecisionEngine {
  constructor(options = {}) {
    this.entryWindowMs = options.entryWindowMs ?? ACCESS_CONFIG.entryWindowMs
    this.now = options.now ?? Date.now
    this.processedTrackIds = new Set()
    this.pendingEntrants = []
    this.eventSequence = 0
    this.windows = []
    this.checkingAt = null
    this.state = this.initialState()
  }

  credentialChecking(timestamp = this.now()) {
    this.closePreviousWindows(timestamp)
    this.checkingAt = timestamp
    this.processedTrackIds.clear()
    this.pendingEntrants = []
    this.state = {
      ...this.state,
      outcome: ACCESS_OUTCOME.checking,
      credential: { status: 'checking', message: 'Checking signature and validity window.' },
      entryWindowOpenedAt: null,
      entryWindowExpiresAt: null,
      entrantsCounted: 0,
      lastEventAt: timestamp,
    }
    return this.snapshot(timestamp)
  }

  credentialVerified(verification, timestamp = this.now()) {
    if (this.checkingAt === null) this.closePreviousWindows(timestamp)
    if (verification.valid && verification.status === 'valid') {
      this.windows.push({
        openedAt: timestamp,
        startsAt: this.checkingAt ?? timestamp,
        expiresAt: timestamp + this.entryWindowMs,
        credential: verification.credential ?? null,
        entrants: 0,
        closedAt: null,
      })
      this.windows = this.windows.slice(-16)
      this.state = {
        ...this.state,
        outcome: ACCESS_OUTCOME.credentialReady,
        credential: {
          status: 'valid',
          message: verification.message,
          details: verification.credential ?? null,
        },
        entryWindowOpenedAt: timestamp,
        entryWindowExpiresAt: timestamp + this.entryWindowMs,
        entrantsCounted: 0,
        lastEventAt: timestamp,
      }
      this.addEvent('credential-verified', timestamp, 'Credential verified', verification.credential?.displayName)
      this.addEvent('entry-window-opened', timestamp, 'Entry window opened', verification.credential?.displayName)
    } else {
      this.state = {
        ...this.state,
        outcome: ACCESS_OUTCOME.waiting,
        credential: {
          status: verification.status,
          message: verification.message,
          details: null,
        },
        entryWindowOpenedAt: null,
        entryWindowExpiresAt: null,
        entrantsCounted: 0,
        lastEventAt: timestamp,
      }
      this.addEvent('credential-rejected', timestamp, 'Credential rejected')
    }

    const pendingEntrants = this.pendingEntrants
    this.checkingAt = null
    this.pendingEntrants = []
    for (const entrant of pendingEntrants) {
      this.adjudicateEntrant(entrant.trackId, entrant.timestamp, entrant.evidence)
    }
    return this.snapshot(timestamp)
  }

  recordEntrant(trackId, timestamp = this.now(), evidence = 'boundary', confirmedAt = timestamp) {
    if (this.processedTrackIds.has(trackId)) return this.snapshot(confirmedAt)
    this.processedTrackIds.add(trackId)

    if (this.state.outcome === ACCESS_OUTCOME.checking) {
      this.pendingEntrants.push({ trackId, timestamp, evidence })
      return this.snapshot(confirmedAt)
    }

    this.adjudicateEntrant(trackId, timestamp, evidence)
    return this.snapshot(confirmedAt)
  }

  adjudicateEntrant(trackId, timestamp, evidence = 'boundary') {
    const window = [...this.windows].reverse().find((item) => timestamp >= item.startsAt
      && timestamp <= item.expiresAt
      && (item.closedAt === null || timestamp < item.closedAt)
      && (!item.credential || timestamp < Date.parse(item.credential.validUntil)))
    const visitorName = window?.credential?.displayName
    const withinEntryWindow = Boolean(window)
    const entryLabel = evidence === 'inferred' ? 'Inferred entry' : 'Entrant counted'

    if (!withinEntryWindow) {
      this.state = {
        ...this.state,
        outcome: ACCESS_OUTCOME.unauthorized,
        entryWindowOpenedAt: null,
        entryWindowExpiresAt: null,
        entrantsCounted: this.state.outcome === ACCESS_OUTCOME.unauthorized
          ? this.state.entrantsCounted + 1
          : 1,
        lastEventAt: timestamp,
        entryEvidence: evidence,
      }
      this.addEvent('entrant-counted', timestamp, `${entryLabel} (track ${trackId})`, visitorName)
      this.addEvent('unauthorized-entry', timestamp, 'Unauthorized entry', visitorName)
      return
    }

    const entrantsCounted = ++window.entrants
    this.state = {
      ...this.state,
      outcome: entrantsCounted === 1
        ? ACCESS_OUTCOME.authorized
        : ACCESS_OUTCOME.tailgating,
      entrantsCounted,
      lastEventAt: timestamp,
      entryEvidence: evidence,
      credential: { status: 'valid', message: 'Credential is valid.', details: window.credential },
      entryWindowOpenedAt: window.openedAt,
      entryWindowExpiresAt: Math.min(window.expiresAt, window.closedAt ?? Number.POSITIVE_INFINITY),
    }
    this.addEvent('entrant-counted', timestamp, `${entryLabel} (track ${trackId})`, visitorName)
    this.addEvent(
      entrantsCounted === 1 ? 'authorized-entry' : 'possible-tailgating',
      timestamp,
      entrantsCounted === 1 ? 'Authorized entry' : 'Possible tailgating',
      visitorName,
    )
  }

  updatePeopleDetected(peopleDetected, timestamp = this.now()) {
    this.state = { ...this.state, peopleDetected }
    return this.snapshot(timestamp)
  }

  snapshot(timestamp = this.now()) {
    const entryWindowActive = this.state.entryWindowExpiresAt !== null
      && timestamp <= this.state.entryWindowExpiresAt
    const entryWindowRemainingMs = entryWindowActive
      ? Math.max(0, this.state.entryWindowExpiresAt - timestamp)
      : 0

    if (!entryWindowActive
      && this.state.outcome === ACCESS_OUTCOME.credentialReady) {
      this.state = {
        ...this.state,
        outcome: ACCESS_OUTCOME.waiting,
        credential: { status: 'none', message: 'Present a valid PassFlow credential.' },
        entryWindowOpenedAt: null,
        entryWindowExpiresAt: null,
      }
    }

    return {
      ...this.state,
      credential: { ...this.state.credential },
      entryWindowActive,
      entryWindowRemainingMs,
    }
  }

  reset() {
    this.windows = []
    this.checkingAt = null
    const events = this.state.events
    this.processedTrackIds.clear()
    this.pendingEntrants = []
    this.state = this.initialState(events)
    return this.snapshot()
  }

  setEntryWindowMs(entryWindowMs, timestamp = this.now()) {
    this.entryWindowMs = entryWindowMs
    if (this.state.entryWindowOpenedAt !== null && this.state.credential.status === 'valid') {
      const current = this.windows.find((window) => window.openedAt === this.state.entryWindowOpenedAt)
      if (current) current.expiresAt = current.openedAt + entryWindowMs
      this.state = {
        ...this.state,
        entryWindowExpiresAt: this.state.entryWindowOpenedAt + entryWindowMs,
      }
    }
    return this.snapshot(timestamp)
  }

  closePreviousWindows(timestamp) {
    for (const window of this.windows) window.closedAt ??= timestamp
  }

  addEvent(type, timestamp, label, visitorName) {
    this.eventSequence += 1
    this.state = {
      ...this.state,
      events: [...this.state.events, {
        id: `${timestamp}-${this.eventSequence}`,
        type,
        timestamp,
        label,
        ...(visitorName ? { visitorName } : {}),
      }].slice(-30),
    }
  }

  initialState(events = []) {
    return {
      outcome: ACCESS_OUTCOME.waiting,
      credential: { status: 'none', message: 'Present a valid PassFlow credential.' },
      entryWindowOpenedAt: null,
      entryWindowExpiresAt: null,
      entrantsCounted: 0,
      peopleDetected: 0,
      entryEvidence: null,
      lastEventAt: null,
      events,
    }
  }
}
