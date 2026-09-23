'use client'

import { AppHeader } from '@/app/components/AppHeader'
import { DevicePanel } from '@/app/components/DevicePanel'
import { FutureState } from '@/app/components/FutureState'
import { EntrantsIcon, LockIcon } from '@/app/components/icons'
import { LiveCamera } from '@/app/components/LiveCamera'
import { useRingDevice } from '@/app/hooks/useRingDevice'

export default function PassFlow() {
  const { device, status, error } = useRingDevice()

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <main className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0 px-6 py-10 sm:px-8 lg:border-r lg:border-passflow-border lg:px-10 lg:py-12 xl:px-12">
          <LiveCamera deviceId={device?.id} deviceStatus={status} deviceError={error} />
        </div>

        <aside className="border-t border-passflow-border bg-white px-6 py-10 sm:px-8 lg:border-t-0 lg:px-8 lg:py-12 xl:px-10">
          <DevicePanel device={device} status={status} />
          <FutureState heading="Access Decision" state="Waiting for credential" icon={<LockIcon className="size-5" />} />
          <FutureState heading="Entrants" state="Not analyzing" icon={<EntrantsIcon className="size-5" />} />
        </aside>
      </main>
    </div>
  )
}
