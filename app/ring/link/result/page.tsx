import { cookies } from 'next/headers'
import { RING_LINK_RESULT_COOKIE, verifyRingLinkResult } from '@/lib/ring-owner-session'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ring account link | PassFlow', referrer: 'no-referrer' as const }

const messages = {
  success: 'Your Ring account is linked to PassFlow.',
  'sign-in-failed': 'Owner sign-in failed. Return to Ring and start linking again.',
  'sign-in-required': 'Sign in as the PassFlow owner to finish linking.',
  unavailable: 'Owner sign-in is not configured on this deployment.',
  'invalid-request': 'This account-link request is invalid. Start again from Ring.',
  'invalid-or-expired': 'The Ring account link could not be verified or has expired. Start again from Ring.',
  'already-used': 'This Ring link has already been used. Start again from Ring if you still need to connect.',
  'ring-rejected': 'Ring did not accept the account link. Start again from Ring.',
  'completion-pending': 'Ring accepted the link, but final activation is pending. Contact the PassFlow owner.',
  failure: 'PassFlow could not complete the Ring account link. Try again from Ring.',
} as const

export default async function RingLinkResultPage() {
  const jar = await cookies()
  const status = verifyRingLinkResult(jar.get(RING_LINK_RESULT_COOKIE)?.value)
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
    <section className="w-full rounded-2xl border border-white/10 bg-slate-900 p-8 text-slate-100 shadow-xl" role="status">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">PassFlow · Ring</p>
      <h1 className="mt-3 text-2xl font-semibold">{status === 'success' ? 'Account linked' : 'Account link status'}</h1>
      <p className="mt-4 text-sm text-slate-300">{status ? messages[status] : 'No recent account-link result is available. Check the deployment configuration and start again from Ring.'}</p>
    </section>
  </main>
}
