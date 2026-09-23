import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const sharedProps: IconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
}

export function ApertureIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.7 3.4-4.1 7.1M21 10h-8.2m5.9 8.1-4.1-7.1M9.3 20.6l4.1-7.1M3 14h8.2M5.3 5.9l4.1 7.1" />
    </svg>
  )
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <path d="M14.5 6 13 4h-2L9.5 6H5.8A1.8 1.8 0 0 0 4 7.8v9.4A1.8 1.8 0 0 0 5.8 19h12.4a1.8 1.8 0 0 0 1.8-1.8V7.8A1.8 1.8 0 0 0 18.2 6h-3.7Z" />
      <circle cx="12" cy="12.5" r="3.25" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <path d="m9 7 8 5-8 5V7Z" />
    </svg>
  )
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <rect x="5.5" y="10" width="13" height="10" rx="2" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  )
}

export function EntrantsIcon(props: IconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19M16 5.5a3 3 0 0 1 0 5.8M16.5 14a4.8 4.8 0 0 1 4 4.7" />
    </svg>
  )
}
