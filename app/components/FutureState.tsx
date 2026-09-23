import type { ReactNode } from 'react'

interface FutureStateProps {
  heading: string
  state: string
  icon: ReactNode
}

export function FutureState({ heading, state, icon }: FutureStateProps) {
  return (
    <section aria-labelledby={`${heading.toLowerCase().replaceAll(' ', '-')}-heading`} className="border-b border-passflow-border py-8 last:border-b-0 last:pb-0">
      <h2 id={`${heading.toLowerCase().replaceAll(' ', '-')}-heading`} className="section-label">
        {heading}
      </h2>
      <div className="mt-5 flex items-center gap-4 rounded-xl bg-passflow-soft px-5 py-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-passflow-muted ring-1 ring-passflow-border">
          {icon}
        </span>
        <p className="text-base font-semibold text-passflow-ink">{state}</p>
      </div>
    </section>
  )
}
