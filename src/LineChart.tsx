export interface ChartPoint {
  label: string
  value: number
}

interface Props {
  title: string
  points: ChartPoint[]
  zeroLine?: boolean
  formatValue?: (v: number) => string
}

const H = 150
const PAD_Y = 18
const PAD_X = 30
const STEP = 34

export default function LineChart({ title, points, zeroLine = false, formatValue }: Props) {
  if (points.length < 2) return null
  const fmt = formatValue ?? ((v: number) => String(Math.round(v * 10) / 10))

  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (zeroLine) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  if (min === max) {
    min -= 1
    max += 1
  }
  const width = PAD_X + STEP * (points.length - 1) + PAD_X
  const y = (v: number) => PAD_Y + ((max - v) / (max - min)) * (H - 2 * PAD_Y)
  const x = (i: number) => PAD_X + i * STEP

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="chart-scroll">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`${title}: ${points.map((p) => `${p.label} ${fmt(p.value)}`).join(', ')}`}
        >
          <text x={4} y={y(max) + 4} className="chart-axis">{fmt(max)}</text>
          <text x={4} y={y(min) + 4} className="chart-axis">{fmt(min)}</text>
          <line x1={PAD_X - 6} y1={y(max)} x2={width - PAD_X + 6} y2={y(max)} className="chart-grid" />
          <line x1={PAD_X - 6} y1={y(min)} x2={width - PAD_X + 6} y2={y(min)} className="chart-grid" />
          {zeroLine && min < 0 && max > 0 && (
            <line x1={PAD_X - 6} y1={y(0)} x2={width - PAD_X + 6} y2={y(0)} className="chart-zero" />
          )}
          <path d={path} className="chart-line" fill="none" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.value)} r={3.5} className="chart-dot">
                <title>{`${p.label}: ${fmt(p.value)}`}</title>
              </circle>
              <text x={x(i)} y={H - 3} textAnchor="middle" className="chart-axis">
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
