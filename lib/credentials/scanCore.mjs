/** Verification lifecycle is independent of overlay updates and empty video frames. */
export function createCredentialScan({ verify, checking, verified, status }) {
  let controller = null
  let epoch = 0
  let pendingToken = null
  return {
    reset() {
      epoch += 1
      controller?.abort()
      controller = null
      pendingToken = null
      status('scanning')
    },
    async submit(token, isCurrent = () => true) {
      if (pendingToken === token) return
      controller?.abort()
      controller = new AbortController()
      const active = controller
      const session = epoch
      pendingToken = token
      status('detected')
      checking()
      status('verifying')
      try {
        const result = await verify(token, active.signal)
        if (active.signal.aborted || session !== epoch || !isCurrent()) return
        verified(result)
        status(result.valid ? 'verified' : 'rejected', result.message)
      } catch (error) {
        if (active.signal.aborted || session !== epoch || !isCurrent()) return
        const message = error instanceof Error ? error.message : 'Credential verification failed.'
        verified({ valid: false, status: 'malformed', message })
        status('failed', message)
      } finally {
        if (session === epoch && controller === active) pendingToken = null
      }
    },
  }
}
