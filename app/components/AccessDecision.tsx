import type { AccessDecisionState } from '@/app/types/access'
import { CheckIcon, ClockIcon, LockIcon, XIcon } from './icons'

interface AccessDecisionProps {
  decision: AccessDecisionState
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AccessDecision({ decision }: AccessDecisionProps) {
  const result = decision.state === 'result' ? decision.result : null
  const valid = result?.status === 'valid'
  const timeRestricted = result?.status === 'expired' || result?.status === 'not-yet-valid'
  const checking = decision.state === 'checking'
  const decisionTitle = valid
    ? 'Access granted'
    : result?.status === 'expired'
      ? 'Access denied · Expired'
      : result?.status === 'not-yet-valid'
        ? 'Access denied · Not yet valid'
        : result
          ? 'Access denied · Invalid credential'
          : checking
            ? 'Verifying credential'
            : 'Waiting for credential'

  return (
    <section aria-labelledby="access-decision-heading" className="border-b border-passflow-border py-8 last:border-b-0 last:pb-0">
      <h2 id="access-decision-heading" className="section-label">Access Decision</h2>
      <div
        aria-live="polite"
        className={`mt-5 rounded-xl border px-5 py-6 ${
          valid
            ? 'border-passflow-success/25 bg-passflow-success/5'
            : timeRestricted
              ? 'border-passflow-warning/25 bg-passflow-warning/5'
              : result
              ? 'border-passflow-danger/20 bg-passflow-danger/5'
              : 'border-transparent bg-passflow-soft'
        }`}
      >
        <div className="flex items-start gap-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-full bg-white ring-1 ${
            valid
              ? 'text-passflow-success ring-passflow-success/25'
              : timeRestricted
                ? 'text-passflow-warning ring-passflow-warning/25'
                : result
                ? 'text-passflow-danger ring-passflow-danger/20'
                : 'text-passflow-muted ring-passflow-border'
          }`}>
            {valid ? (
              <CheckIcon className="size-5" />
            ) : result ? (
              <XIcon className="size-5" />
            ) : checking ? (
              <ClockIcon className="size-5" />
            ) : (
              <LockIcon className="size-5" />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-base font-semibold text-passflow-ink">
              {decisionTitle}
            </p>
            {valid && result?.credential ? (
              <div className="mt-2 space-y-1 text-sm leading-5 text-passflow-muted">
                <p className="font-semibold text-passflow-ink">{result.credential.displayName}</p>
                <p>{result.credential.location}</p>
                <p>Valid until {formatTime(result.credential.validUntil)}</p>
              </div>
            ) : result ? (
              <p className={`mt-2 text-sm leading-5 ${timeRestricted ? 'text-passflow-warning' : 'text-passflow-danger'}`}>{result.message}</p>
            ) : checking ? (
              <p className="mt-2 text-sm leading-5 text-passflow-muted">Checking signature and validity window.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
