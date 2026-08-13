import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Point, Shape, ShapeKind } from '../types'
import { newId } from '../types'

export const ANNOTATION_COLORS = ['#c8f04a', '#ff5c57', '#4cc9f0', '#ffffff']

interface AnnotatorProps {
  /** Already-saved marks for this frame. Drawn, never edited. */
  shapes: Shape[]
  /** Marks made in the current drawing session. */
  draft?: Shape[]
  /** Omit to render read-only — that is how saved annotations replay. */
  onDraftChange?: (shapes: Shape[]) => void
  tool?: ShapeKind
  color?: string
}

interface Size {
  width: number
  height: number
}

function useElementSize<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => {
      const rect = node.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function angleBetween(from: Point, vertex: Point, to: Point) {
  const a0 = Math.atan2(from.y - vertex.y, from.x - vertex.x)
  const a2 = Math.atan2(to.y - vertex.y, to.x - vertex.x)
  let delta = a2 - a0
  while (delta <= -Math.PI) delta += 2 * Math.PI
  while (delta > Math.PI) delta -= 2 * Math.PI
  return { a0, delta, degrees: Math.abs(delta) * (180 / Math.PI) }
}

/** Renders one shape in pixel space. `size` converts the stored 0..1 points. */
function ShapeView({ shape, size }: { shape: Shape; size: Size }) {
  const px = (p: Point) => ({ x: p.x * size.width, y: p.y * size.height })
  const stroke = shape.color
  const common = {
    stroke,
    strokeWidth: 2.5,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (shape.kind === 'line' && shape.points.length >= 2) {
    const a = px(shape.points[0])
    const b = px(shape.points[1])
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />
        <circle cx={a.x} cy={a.y} r={3.5} fill={stroke} />
        <circle cx={b.x} cy={b.y} r={3.5} fill={stroke} />
      </g>
    )
  }

  if (shape.kind === 'circle' && shape.points.length >= 2) {
    const c = px(shape.points[0])
    const edge = px(shape.points[1])
    const r = Math.hypot(edge.x - c.x, edge.y - c.y)
    return <circle cx={c.x} cy={c.y} r={Math.max(r, 2)} {...common} />
  }

  if (shape.kind === 'free' && shape.points.length >= 2) {
    const d = shape.points
      .map((p, i) => {
        const q = px(p)
        return `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`
      })
      .join(' ')
    return <path d={d} {...common} />
  }

  if (shape.kind === 'angle' && shape.points.length >= 3) {
    const [from, vertex, to] = shape.points.map(px)
    const { a0, delta, degrees } = angleBetween(from, vertex, to)
    const r = Math.min(34, Math.max(18, Math.min(size.width, size.height) * 0.09))
    const start = { x: vertex.x + r * Math.cos(a0), y: vertex.y + r * Math.sin(a0) }
    const end = { x: vertex.x + r * Math.cos(a0 + delta), y: vertex.y + r * Math.sin(a0 + delta) }
    const mid = a0 + delta / 2
    const label = { x: vertex.x + (r + 20) * Math.cos(mid), y: vertex.y + (r + 20) * Math.sin(mid) }
    return (
      <g>
        <line x1={vertex.x} y1={vertex.y} x2={from.x} y2={from.y} {...common} />
        <line x1={vertex.x} y1={vertex.y} x2={to.x} y2={to.y} {...common} />
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 ${delta > 0 ? 1 : 0} ${end.x} ${end.y}`}
          {...common}
          strokeWidth={1.6}
          strokeDasharray="4 3"
        />
        <text
          x={label.x}
          y={label.y}
          fill={stroke}
          fontSize="14"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.65)"
          strokeWidth="3.5"
        >
          {Math.round(degrees)}°
        </text>
      </g>
    )
  }

  return null
}

/**
 * Draw lines, angles, circles and freehand marks over a frozen frame.
 *
 * Points are stored normalised to the frame so a drawing made with a thumb on a
 * phone lines up exactly when the student opens it on a laptop.
 */
export function Annotator({
  shapes,
  draft = [],
  onDraftChange,
  tool = 'line',
  color = ANNOTATION_COLORS[0],
}: AnnotatorProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  // The stroke in progress is mirrored into a ref so pointerup can read it
  // synchronously — committing from inside a state updater loses strokes.
  const strokeRef = useRef<Shape | null>(null)
  const [stroke, setStroke] = useState<Shape | null>(null)
  // Angle needs three taps, so its partial state outlives a single gesture.
  const [pendingAngle, setPendingAngle] = useState<Point[]>([])
  const drawing = useRef(false)
  const readOnly = !onDraftChange

  const setStrokeBoth = useCallback((next: Shape | null) => {
    strokeRef.current = next
    setStroke(next)
  }, [])

  useEffect(() => {
    setPendingAngle([])
    setStrokeBoth(null)
  }, [tool, setStrokeBoth])

  const pointFrom = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): Point | null => {
      const node = ref.current
      if (!node) return null
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      }
    },
    [ref],
  )

  const commit = useCallback(
    (shape: Shape) => {
      // Only the draft grows — saved shapes are a backdrop, so re-drawing on an
      // annotated frame never duplicates what is already stored.
      onDraftChange?.([...draft, shape])
    },
    [onDraftChange, draft],
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly) return
    const point = pointFrom(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === 'angle') {
      const next = [...pendingAngle, point]
      if (next.length === 3) {
        commit({ id: newId(), kind: 'angle', points: next, color })
        setPendingAngle([])
      } else {
        setPendingAngle(next)
      }
      return
    }

    drawing.current = true
    setStrokeBoth({ id: 'stroke', kind: tool, points: [point, point], color })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || !drawing.current) return
    const point = pointFrom(event)
    if (!point) return
    const current = strokeRef.current
    if (!current) return
    setStrokeBoth(
      current.kind === 'free'
        ? { ...current, points: [...current.points, point] }
        : { ...current, points: [current.points[0], point] },
    )
  }

  const endStroke = () => {
    if (readOnly || !drawing.current) return
    drawing.current = false
    const finished = strokeRef.current
    setStrokeBoth(null)
    if (!finished) return
    const [a, b] = [finished.points[0], finished.points[finished.points.length - 1]]
    // Ignore taps that never became a stroke — on a phone these are almost
    // always a missed scrub, not an intentional mark.
    if (Math.hypot(b.x - a.x, b.y - a.y) > 0.012) commit({ ...finished, id: newId() })
  }

  const angleGuide: Shape | null =
    pendingAngle.length > 0
      ? { id: 'guide', kind: pendingAngle.length === 2 ? 'line' : 'free', points: pendingAngle, color }
      : null

  return (
    <div
      ref={ref}
      className="stage-overlay"
      style={{ cursor: readOnly ? 'default' : 'crosshair', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      /* No onPointerLeave: pointer capture guarantees the pointerup lands here
         even if the thumb slides off the frame, and cancelling a stroke at the
         edge would throw away marks that run to the border of the picture. */
    >
      <svg width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
        {shapes.map((shape) => (
          <ShapeView key={shape.id} shape={shape} size={size} />
        ))}
        {draft.map((shape) => (
          <ShapeView key={shape.id} shape={shape} size={size} />
        ))}
        {stroke && <ShapeView shape={stroke} size={size} />}
        {angleGuide && <ShapeView shape={angleGuide} size={size} />}
        {pendingAngle.map((p, i) => (
          <circle
            key={i}
            cx={p.x * size.width}
            cy={p.y * size.height}
            r={4}
            fill={color}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  )
}
