import { verifyOwnerSession, RING_OWNER_COOKIE, ownerCredentialsConfigured } from '@/lib/ring-owner-session'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect Ring account | PassFlow', referrer: 'no-referrer' as const }

type Props = { searchParams: Promise<{ nonce?: string | string[]; time?: string | string[] }> }

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

export default async function RingLinkPage({ searchParams }: Props) {
  const params = await searchParams
  const nonce = first(params.nonce) ?? ''
  const time = first(params.time) ?? ''
  const validShape = /^[A-Za-z0-9_-]{43}$/.test(nonce) && /^\d{13}$/.test(time)
  const jar = await cookies()
  const ownerEmail = verifyOwnerSession(jar.get(RING_OWNER_COOKIE)?.value)

  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
    <section className="w-full rounded-2xl border border-white/10 bg-slate-900 p-8 text-slate-100 shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">PassFlow · Ring</p>
      <h1 className="mt-3 text-2xl font-semibold">Connect Ring account</h1>
      {!validShape ? <p className="mt-4 text-sm text-slate-300">This Ring link is missing required details or has an invalid format. Return to Ring and start linking again.</p> : !ownerCredentialsConfigured() ?
        <p className="mt-4 text-sm text-slate-300">Owner sign-in is not configured on this deployment.</p> : ownerEmail ?
        <form action="/api/ring/link/complete" method="post" className="mt-6 space-y-4">
          <p className="text-sm text-slate-300">Signed in as {ownerEmail}. Confirm to finish linking the Ring account to this PassFlow owner.</p>
          <input type="hidden" name="nonce" value={nonce} />
          <input type="hidden" name="time" value={time} />
          <button className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950" type="submit">Complete account link</button>
        </form> :
        <form action="/api/ring/link/login" method="post" className="mt-6 space-y-4">
          <p className="text-sm text-slate-300">Sign in as the configured PassFlow owner to verify this account link.</p>
          <input type="hidden" name="nonce" value={nonce} />
          <input type="hidden" name="time" value={time} />
          <label className="block text-sm">Owner email<input required autoComplete="username" type="email" name="email" className="mt-1 block w-full rounded-lg bg-slate-800 px-3 py-2" /></label>
          <label className="block text-sm">Password<input required autoComplete="current-password" type="password" name="password" className="mt-1 block w-full rounded-lg bg-slate-800 px-3 py-2" /></label>
          <button className="rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950" type="submit">Sign in and continue</button>
        </form>}
    </section>
  </main>
}
