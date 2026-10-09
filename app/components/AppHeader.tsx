import { ApertureIcon } from './icons'

export function AppHeader() {
  return (
    <header className="border-b border-passflow-border bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-col items-start gap-1 px-4 py-4 sm:min-h-20 sm:flex-row sm:items-center sm:gap-5 sm:px-8 sm:py-0 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-passflow-accent text-white">
            <ApertureIcon className="size-6" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-passflow-ink sm:text-2xl">
            PassFlow
          </span>
        </div>
        <div className="hidden h-7 w-px bg-passflow-border sm:block" />
        <p className="text-xs text-passflow-muted sm:text-sm">
          Visual Access Control powered by Ring
        </p>
      </div>
    </header>
  )
}
