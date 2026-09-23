import { ApertureIcon } from './icons'

export function AppHeader() {
  return (
    <header className="border-b border-passflow-border bg-white">
      <div className="mx-auto flex min-h-20 max-w-[1600px] items-center gap-5 px-6 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-passflow-accent text-white">
            <ApertureIcon className="size-6" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-passflow-ink sm:text-2xl">
            PassFlow
          </span>
        </div>
        <div className="hidden h-7 w-px bg-passflow-border sm:block" />
        <p className="hidden text-sm text-passflow-muted sm:block">
          Visual Access Control powered by Ring
        </p>
      </div>
    </header>
  )
}
