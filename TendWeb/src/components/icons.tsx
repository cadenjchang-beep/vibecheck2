/**
 * Inline SVG icons.
 *
 * `currentColor` throughout so an icon inherits whatever it sits in, and every
 * one is `aria-hidden` — icons here always sit next to a label or inside a
 * control that already has an accessible name.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const PulseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h3l2.5-7 4 14L15 12h6" />
  </Svg>
)

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
)

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
)

export const CircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
  </Svg>
)

export const MealIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v8a2 2 0 002 2h0a2 2 0 002-2V3M8 13v8" />
    <path d="M16 3c-1.5 1.5-2 3-2 5s.5 2.5 2 2.5V21" />
  </Svg>
)

export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
    <path d="M2 3h2.2l2.3 12.2a1.5 1.5 0 001.5 1.2h9.3a1.5 1.5 0 001.5-1.2L21 7H5.2" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 003.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H8a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V8a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const RepeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </Svg>
)

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
)

export const ForwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8l4 4-4 4" />
  </Svg>
)

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
)

export const LeafIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20c8-1 14-6 15-16-9 0-15 4-15 11 0 2 .4 3.6 1 5z" />
    <path d="M4 20c2-5 5-8 9-10" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
)

export const ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  calendar: CalendarIcon,
  check: CheckCircleIcon,
  list: ListIcon,
  cart: CartIcon,
  meal: MealIcon,
  forward: ForwardIcon,
}
