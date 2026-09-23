import type { AccessDecisionState } from '@/app/types/access'
import { CheckIcon, ClockIcon, LockIcon, XIcon } from './icons'

interface AccessDecisionProps {
  decision: AccessDecisionState
}

const TITLES: Record<AccessDecisionState['outcome'], string> = {
  'waiting-for-credential': 'WAITING FOR CREDENTIAL',
  'checking-credential': 'VERIFYING CREDENTIAL',
  'credential-verified-waiting-for-entry': 'CREDENTIAL VERIFIED — WAITING FOR ENTRY',
  'authorized-entry': 'AUTHORIZED ENTRY',
  'possible-tailgating': 'POSSIBLE TAILGATING',
  'unauthorized-entry': 'UNAUTHORIZED ENTRY',
}

function credentialLabel(decision: AccessDecisionState) {
  const { credential } = decision
  if (credential.status === 'none') return 'Not presented'
  if (credential.status === 'checking') return 'Verifying'
  if (credential.status === 'valid') {
    return credential.details?.displayName
      ? `Verified · ${credential.details.displayName}`
      : 'Verified'
  }
  if (credential.status === 'not-yet-valid') return 'Not yet valid'
  if (credential.status === 'invalid-signature') return 'Invalid signature'
  return credential.status.charAt(0).toUpperCase() + credential.status.slice(1)
}

function decisionMessage(decision: AccessDecisionState) {
  if (decision.outcome === 'authorized-entry') return 'One entrant crossed during the active credential window.'
  if (decision.outcome === 'possible-tailgating') return 'More than one entrant crossed during a single credential window.'
  if (decision.outcome === 'unauthorized-entry') return 'An entrant crossed without an active valid credential window.'
  return decision.credential.message
}

export function AccessDecision({ decision }: AccessDecisionProps) {
  const authorized = decision.outcome === 'authorized-entry'
  const tailgating = decision.outcome === 'possible-tailgating'
  const unauthorized = decision.outcome === 'unauthorized-entry'
  const warning = tailgating
  const danger = unauthorized
  const active = decision.outcome === 'credential-verified-waiting-for-entry'
  const checking = decision.outcome === 'checking-credential'
  const windowLabel = decision.entryWindowActive
    ? `${Math.max(1, Math.ceil(decision.entryWindowRemainingMs / 1_000))}s remaining`
    : 'Closed'

  return (
    <section aria-labelledby="access-decision-heading" className="border-b border-passflow-border py-8 last:border-b-0 last:pb-0">
      <h2 id="access-decision-heading" className="section-label">Access Decision</h2>
      <div
        aria-live="polite"
        className={`mt-5 rounded-xl border px-5 py-6 ${
          authorized
            ? 'border-passflow-success/25 bg-passflow-success/5'
            : warning
              ? 'border-passflow-warning/25 bg-passflow-warning/5'
              : danger
                ? 'border-passflow-danger/20 bg-passflow-danger/5'
                : active
                  ? 'border-passflow-accent/25 bg-passflow-accent/5'
                  : 'border-transparent bg-passflow-soft'
        }`}
      >
        <div className="flex items-start gap-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-full bg-white ring-1 ${
            authorized
              ? 'text-passflow-success ring-passflow-success/25'
              : warning
                ? 'text-passflow-warning ring-passflow-warning/25'
                : danger
                  ? 'text-passflow-danger ring-passflow-danger/20'
                  : active
                    ? 'text-passflow-accent ring-passflow-accent/25'
                    : 'text-passflow-muted ring-passflow-border'
          }`}>
            {authorized ? (
              <CheckIcon className="size-5" />
            ) : warning || danger ? (
              <XIcon className="size-5" />
            ) : checking || active ? (
              <ClockIcon className="size-5" />
            ) : (
              <LockIcon className="size-5" />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-bold tracking-[0.08em] text-passflow-ink">
              {TITLES[decision.outcome]}
            </p>
            <p className="mt-2 text-sm leading-5 text-passflow-muted">
              {decisionMessage(decision)}
            </p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-passflow-border border-t border-passflow-border text-sm">
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="text-passflow-muted">Credential</dt>
            <dd className="text-right font-semibold text-passflow-ink">{credentialLabel(decision)}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="text-passflow-muted">Entry window</dt>
            <dd className="text-right font-semibold text-passflow-ink">{windowLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <dt className="text-passflow-muted">People detected</dt>
            <dd className="text-right font-semibold tabular-nums text-passflow-ink">{decision.peopleDetected}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 pt-3">
            <dt className="text-passflow-muted">Entrants counted</dt>
            <dd className="text-right font-semibold tabular-nums text-passflow-ink">{decision.entrantsCounted}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
