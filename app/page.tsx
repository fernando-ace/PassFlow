'use client'

import { AccessDecision } from '@/app/components/AccessDecision'
import { AccessTimeline } from '@/app/components/AccessTimeline'
import { AppHeader } from '@/app/components/AppHeader'
import { CreatePass } from '@/app/components/CreatePass'
import { DevicePanel } from '@/app/components/DevicePanel'
import { LiveCamera } from '@/app/components/LiveCamera'
import { useRingDevice } from '@/app/hooks/useRingDevice'
import { useAccessDecision } from '@/app/hooks/useAccessDecision'
import { resetVideoProcessorSessions } from '@/lib/video-processors/registry'
import { useCallback } from 'react'

export default function PassFlow() {
  const { device, status, error } = useRingDevice()
  const access = useAccessDecision()
  const resetSession = useCallback(() => {
    resetVideoProcessorSessions()
    access.resetDecision()
  }, [access.resetDecision])

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <main className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 px-6 py-10 sm:px-8 lg:border-r lg:border-passflow-border lg:px-10 lg:py-12 xl:px-12">
          <LiveCamera
            deviceId={device?.id}
            deviceStatus={status}
            deviceError={error}
            onCredentialChecking={access.credentialChecking}
            onCredentialVerified={access.credentialVerified}
            onPeopleResult={access.processPeopleResult}
            onReset={resetSession}
            onEntryWindowDurationChange={access.setEntryWindowMs}
          />
          <CreatePass />
        </div>

        <aside className="border-t border-passflow-border bg-white px-6 py-10 sm:px-8 lg:border-t-0 lg:px-8 lg:py-12 xl:px-10">
          <DevicePanel device={device} status={status} />
          <AccessDecision decision={access.decision} onReset={resetSession} />
          <AccessTimeline events={access.decision.events} />
        </aside>
      </main>
    </div>
  )
}
