import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1.5 1.5 0 0 0 1.24-.66l.62-.93A1.5 1.5 0 0 1 9.8 3.75h4.4a1.5 1.5 0 0 1 1.24.66l.62.93A1.5 1.5 0 0 0 17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    <circle cx="12" cy="12.2" r="3.4" />
  </Icon>
)

export const FilmIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M3 9h18M3 15h18M8 4.5v15M16 4.5v15" />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5v14M15 5v14" strokeWidth="2.4" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
)

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9.5" cy="8" r="3.4" />
    <path d="M3.5 20a6 6 0 0 1 12 0" />
    <path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.6 14.6A6 6 0 0 1 21 20" />
  </Icon>
)

export const TargetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
)

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 21V3.8" />
    <path d="M6 4.2l10.5 2.6a.6.6 0 0 1 .12 1.12L6 12.6" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.5 1.5 0 0 0 .3 1.66l.05.05a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.5 1.5 0 0 0-2.55 1.07v.15a1.9 1.9 0 0 1-3.8 0v-.08a1.5 1.5 0 0 0-2.62-1.02l-.05.05a1.9 1.9 0 1 1-2.7-2.7l.06-.05A1.5 1.5 0 0 0 4.25 13.7H4.1a1.9 1.9 0 0 1 0-3.8h.08A1.5 1.5 0 0 0 5.2 7.28l-.05-.05a1.9 1.9 0 1 1 2.7-2.7l.05.06a1.5 1.5 0 0 0 1.66.3h.07A1.5 1.5 0 0 0 10.54 3.5v-.15a1.9 1.9 0 0 1 3.8 0v.08a1.5 1.5 0 0 0 2.55 1.07l.05-.05a1.9 1.9 0 1 1 2.7 2.7l-.06.05a1.5 1.5 0 0 0-.3 1.66v.07a1.5 1.5 0 0 0 1.37.9h.15a1.9 1.9 0 0 1 0 3.8h-.08a1.5 1.5 0 0 0-1.37.9z" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.8 12.1a1.4 1.4 0 0 0 1.4 1.3h6.6a1.4 1.4 0 0 0 1.4-1.3L17.5 7" />
  </Icon>
)

export const CloudIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18.5a4 4 0 0 1-.4-7.98A5.2 5.2 0 0 1 16.7 9.6 3.95 3.95 0 0 1 17 18.5z" />
  </Icon>
)

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.4" />
    <path d="M10.5 5.4h3" />
  </Icon>
)

export const LineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20L20 4" />
    <circle cx="4" cy="20" r="1.6" fill="currentColor" />
    <circle cx="20" cy="4" r="1.6" fill="currentColor" />
  </Icon>
)

export const AngleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16M4 20L15 6" />
    <path d="M11.5 20a7.6 7.6 0 0 0-1.1-3.9" />
  </Icon>
)

export const CircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7.5" />
  </Icon>
)

export const PenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20l1-3.6L15.4 6a2 2 0 0 1 2.83 0l.77.77a2 2 0 0 1 0 2.83L8.6 19l-3.6 1z" />
  </Icon>
)

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    <path d="M7.5 5.5L4 9l3.5 3.5" />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5l8.5 15h-17z" />
    <path d="M12 10v4M12 16.8v.2" />
  </Icon>
)

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
  </Icon>
)
