import type { AccessEvent } from '@/app/types/access'

interface AccessTimelineProps {
  events: AccessEvent[]
}

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

export function AccessTimeline({ events }: AccessTimelineProps) {
  const recentEvents = events.slice(-8).reverse()

  return (
    <section aria-labelledby="access-timeline-heading" className="border-b border-passflow-border py-8 last:border-b-0 last:pb-0">
      <h2 id="access-timeline-heading" className="section-label">Session timeline</h2>
      {recentEvents.length ? (
        <ol className="mt-5 space-y-4">
          {recentEvents.map((event) => (
            <li key={event.id} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
              <span className="mt-1 size-2 rounded-full bg-passflow-accent" aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-semibold text-passflow-ink">{event.label}</p>
                  <time className="text-xs tabular-nums text-passflow-faint" dateTime={new Date(event.timestamp).toISOString()}>
                    {timeLabel(event.timestamp)}
                  </time>
                </div>
                {event.visitorName ? <p className="mt-1 truncate text-passflow-muted">{event.visitorName}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm leading-6 text-passflow-muted">Access events from this browser session will appear here.</p>
      )}
    </section>
  )
}
