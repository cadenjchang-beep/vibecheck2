interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  }
}

/** Flagstick — rounds / play. */
export function FlagIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 21V4" />
      <path d="M6 4.5 17 7 6 9.5Z" fill="currentColor" stroke="none" />
      <path d="M4 21h6" />
    </svg>
  )
}

/** Ball on a tee — practice. */
export function BallIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8" r="4.5" />
      <path d="M12 12.5V19" />
      <path d="M9 19h6" />
      <circle cx="10.5" cy="7" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="13" cy="6.5" r="0.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Trophy — tournaments / events. */
export function TrophyIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.6A2.4 2.4 0 0 0 7 8.4" />
      <path d="M17 5.5h2.4A2.4 2.4 0 0 1 17 8.4" />
      <path d="M12 13v3.5" />
      <path d="M9.3 20.5 10 16.5h4l.7 4Z" />
      <path d="M8 20.5h8" />
    </svg>
  )
}

/** Line chart — trends. */
export function ChartIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 4v14a1 1 0 0 0 1 1h14" />
      <path d="M8 14.5l3.5-4.5 3 2L20 6.5" />
    </svg>
  )
}

/** Gear — more / settings. */
export function GearIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </svg>
  )
}

/** Cloud — sync. */
export function CloudIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17 17.5a3.5 3.5 0 0 0-1-6.86A5 5 0 0 0 6.5 11 3.5 3.5 0 0 0 7 17.5Z" />
    </svg>
  )
}

/** Bullseye — goals. */
export function TargetIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Golf bag — the bag / club distances. */
export function BagIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 8h5a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 13 21H8.5A2.5 2.5 0 0 1 6 18.5v-8A2.5 2.5 0 0 1 8 8Z" />
      <path d="M6 14.5h9.5" />
      <path d="M9 8V5M12 8V4.5" />
      <circle cx="9" cy="4" r="1" />
      <circle cx="12" cy="3.5" r="1" />
      <path d="M15.5 11h1.5a1.5 1.5 0 0 1 1.5 1.5V17" />
    </svg>
  )
}

/** Download tray — export / backup. */
export function DownloadIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 4v10" />
      <path d="M8 10.5l4 3.5 4-3.5" />
      <path d="M5 19h14" />
    </svg>
  )
}

/** Small golf hole + flag mark for the wordmark. */
export function LogoMark({ size = 34, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <ellipse cx="20" cy="31" rx="12" ry="4" className="logo-hole" />
      <path
        d="M17 30V9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M17 9.5 32 13l-15 3.5Z" className="logo-flag" />
    </svg>
  )
}
