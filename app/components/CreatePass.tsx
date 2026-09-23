'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { PassCredential } from '@/lib/credentials/types'

interface CreatedPass {
  credential: PassCredential
  qrDataUrl: string
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function CreatePass() {
  const [displayName, setDisplayName] = useState('')
  const [location, setLocation] = useState('Front door')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [createdPass, setCreatedPass] = useState<CreatedPass | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const now = new Date()
    setValidFrom(toDateTimeLocal(now))
    setValidUntil(toDateTimeLocal(new Date(now.getTime() + 60 * 60_000)))
  }, [])

  async function createPass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const startsAt = new Date(validFrom)
      const endsAt = new Date(validUntil)
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
        throw new Error('Choose a complete validity window.')
      }
      if (endsAt <= startsAt) {
        throw new Error('Valid until must be after valid from.')
      }
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          location,
          validFrom: startsAt.toISOString(),
          validUntil: endsAt.toISOString(),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Pass creation failed.')

      const QRCode = await import('qrcode')
      const qrDataUrl = await QRCode.toDataURL(result.token, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 360,
        color: { dark: '#0f1d2e', light: '#ffffff' },
      })
      setCreatedPass({ credential: result.credential, qrDataUrl })
    } catch (error) {
      setCreatedPass(null)
      setError(error instanceof Error ? error.message : 'Pass creation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="create-pass-heading" className="mt-12 border-t border-passflow-border pt-10">
      <div className="max-w-3xl">
        <h2 id="create-pass-heading" className="text-2xl font-semibold tracking-tight text-passflow-ink">Create temporary pass</h2>
        <p className="mt-2 text-sm leading-6 text-passflow-muted">Generate a signed QR credential for one visitor and one door.</p>
      </div>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={createPass} aria-busy={submitting} className="grid content-start gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="form-label">Visitor name</span>
            <input
              required
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="form-control"
              placeholder="Alex Smith"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="form-label">Door or location</span>
            <select
              required
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="form-control"
            >
              <option>Front door</option>
              <option>Side entrance</option>
              <option>Reception</option>
              <option>Loading entrance</option>
            </select>
          </label>
          <label>
            <span className="form-label">Valid from</span>
            <input required type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className="form-control" />
          </label>
          <label>
            <span className="form-label">Valid until</span>
            <input required type="datetime-local" min={validFrom || undefined} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="form-control" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting || !validFrom || !validUntil} className="control-button control-button-primary">
              {submitting ? 'Generating pass…' : 'Generate signed pass'}
            </button>
            {error ? <p role="alert" className="mt-3 text-sm text-passflow-danger">{error}</p> : null}
          </div>
        </form>

        <div className="min-h-80 rounded-xl border border-passflow-border bg-passflow-soft p-5">
          {createdPass ? (
            <div className="text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-passflow-muted">Present this QR</p>
              <img src={createdPass.qrDataUrl} alt={`QR credential for ${createdPass.credential.displayName}`} className="mx-auto aspect-square w-full max-w-80 rounded-lg bg-white p-2 shadow-sm ring-1 ring-passflow-border" />
              <p className="mt-4 text-base font-semibold text-passflow-ink">{createdPass.credential.displayName}</p>
              <p className="mt-1 text-sm text-passflow-muted">{createdPass.credential.location}</p>
              <p className="mt-1 text-xs leading-5 text-passflow-faint">
                {formatDateTime(createdPass.credential.validFrom)} – {formatDateTime(createdPass.credential.validUntil)}
              </p>
            </div>
          ) : (
            <div className="grid h-full min-h-64 place-items-center text-center">
              <div>
                <p className="text-sm font-semibold text-passflow-ink">No pass created</p>
                <p className="mt-2 text-sm leading-5 text-passflow-muted">The signed QR will appear here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
