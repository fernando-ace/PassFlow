import { notFound } from 'next/navigation'
import { DevQrHarness } from '@/app/components/DevQrHarness'

export default function QrHarnessPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <DevQrHarness />
}
