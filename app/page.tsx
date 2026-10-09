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
  const { devices, device, status, error, selectDevice } = useRingDevice()
  const access = useAccessDecision()
  const resetSession = useCallback(() => {
    resetVideoProcessorSessions()
    access.resetDecision()
  }, [access.resetDecision])

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <main className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="order-1 min-w-0 px-4 py-6 sm:px-8 sm:py-10 lg:col-start-1 lg:row-start-1 lg:border-r lg:border-passflow-border lg:px-10 lg:py-12 xl:px-12">
          <LiveCamera
            deviceId={device?.id}
            deviceOnline={device?.online ?? false}
            deviceStatus={status}
            deviceError={error}
            onCredentialChecking={access.credentialChecking}
            onCredentialVerified={access.credentialVerified}
            onPeopleResult={access.processPeopleResult}
            onReset={resetSession}
            onEntryWindowDurationChange={access.setEntryWindowMs}
          />
        </section>

        <aside className="order-2 min-w-0 border-t border-passflow-border bg-white px-4 py-6 sm:px-8 sm:py-10 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-t-0 lg:px-8 lg:py-12 xl:px-10">
          <DevicePanel devices={devices} device={device} status={status} onSelect={selectDevice} />
          <AccessDecision decision={access.decision} onReset={resetSession} />
          <AccessTimeline events={access.decision.events} />
        </aside>

        <section className="order-3 min-w-0 px-4 pb-8 sm:px-8 lg:col-start-1 lg:row-start-2 lg:border-r lg:border-passflow-border lg:px-10 lg:py-12 xl:px-12">
          <CreatePass />
        </section>
      </main>
    </div>
  )
}
