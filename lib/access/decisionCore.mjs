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
    this.state = this.initialState()
  }

  credentialChecking(timestamp = this.now()) {
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
    if (verification.valid && verification.status === 'valid') {
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
    this.pendingEntrants = []
    for (const entrant of pendingEntrants) {
      this.adjudicateEntrant(entrant.trackId, entrant.timestamp)
    }
    return this.snapshot(timestamp)
  }

  recordEntrant(trackId, timestamp = this.now()) {
    if (this.processedTrackIds.has(trackId)) return this.snapshot(timestamp)
    this.processedTrackIds.add(trackId)

    if (this.state.outcome === ACCESS_OUTCOME.checking) {
      this.pendingEntrants.push({ trackId, timestamp })
      return this.snapshot(timestamp)
    }

    this.adjudicateEntrant(trackId, timestamp)
    return this.snapshot(timestamp)
  }

  adjudicateEntrant(trackId, timestamp) {
    const visitorName = this.state.credential.details?.displayName

    const withinEntryWindow = this.state.credential.status === 'valid'
      && this.state.entryWindowExpiresAt !== null
      && timestamp <= this.state.entryWindowExpiresAt

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
      }
      this.addEvent('entrant-counted', timestamp, `Entrant counted (track ${trackId})`, visitorName)
      this.addEvent('unauthorized-entry', timestamp, 'Unauthorized entry', visitorName)
      return
    }

    const entrantsCounted = this.state.entrantsCounted + 1
    this.state = {
      ...this.state,
      outcome: entrantsCounted === 1
        ? ACCESS_OUTCOME.authorized
        : ACCESS_OUTCOME.tailgating,
      entrantsCounted,
      lastEventAt: timestamp,
    }
    this.addEvent('entrant-counted', timestamp, `Entrant counted (track ${trackId})`, visitorName)
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
    const events = this.state.events
    this.processedTrackIds.clear()
    this.pendingEntrants = []
    this.state = this.initialState(events)
    return this.snapshot()
  }

  setEntryWindowMs(entryWindowMs, timestamp = this.now()) {
    this.entryWindowMs = entryWindowMs
    if (this.state.entryWindowOpenedAt !== null && this.state.credential.status === 'valid') {
      this.state = {
        ...this.state,
        entryWindowExpiresAt: this.state.entryWindowOpenedAt + entryWindowMs,
      }
    }
    return this.snapshot(timestamp)
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
      lastEventAt: null,
      events,
    }
  }
}
