import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Shape, ShapeKind } from '../types'
import { ANNOTATION_COLORS, Annotator } from './Annotator'
import {
  AngleIcon,
  CircleIcon,
  LineIcon,
  PauseIcon,
  PenIcon,
  PlayIcon,
  TrashIcon,
  UndoIcon,
} from '../icons'

const SPEEDS = [0.15, 0.25, 0.5, 1]
/** Most phone slow-motion lands at 120–240fps; 30 is the safe scrub step. */
const FRAME_STEP = 1 / 30

const TOOLS: { kind: ShapeKind; label: string; Icon: typeof LineIcon }[] = [
  { kind: 'line', label: 'Line', Icon: LineIcon },
  { kind: 'angle', label: 'Angle', Icon: AngleIcon },
  { kind: 'circle', label: 'Circle', Icon: CircleIcon },
  { kind: 'free', label: 'Draw', Icon: PenIcon },
]

export interface PlayerAnnotation {
  id: string
  timestampSeconds: number
  shapes: Shape[]
  label: string
}

interface SwingPlayerProps {
  src: string
  annotations: PlayerAnnotation[]
  editable?: boolean
  onAddAnnotation?: (annotation: { timestampSeconds: number; shapes: Shape[]; label: string }) => void
  onDeleteAnnotation?: (id: string) => void
  /** Lets the screen get its sticky footer out of the way of the pen toolbar. */
  onDrawModeChange?: (drawing: boolean) => void
}

function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00s'
  return `${seconds.toFixed(2)}s`
}

export function SwingPlayer({
  src,
  annotations,
  editable = false,
  onAddAnnotation,
  onDeleteAnnotation,
  onDrawModeChange,
}: SwingPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(0.25)
  const [aspect, setAspect] = useState(9 / 16)

  const [drawMode, setDrawMode] = useState(false)
  const [tool, setTool] = useState<ShapeKind>('line')
  const [color, setColor] = useState(ANNOTATION_COLORS[0])
  const [liveShapes, setLiveShapes] = useState<Shape[]>([])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }, [speed])

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current
      if (!video) return
      const clamped = Math.max(0, Math.min(seconds, duration || video.duration || 0))
      video.currentTime = clamped
      setCurrentTime(clamped)
    },
    [duration],
  )

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.playbackRate = speed
      void video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }

  const onLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    if (Number.isFinite(video.duration)) setDuration(video.duration)
    if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
    video.playbackRate = speed
  }

  // A recording made in-app reports Infinity until it has been seeked once.
  const onDurationChange = () => {
    const video = videoRef.current
    if (video && Number.isFinite(video.duration)) setDuration(video.duration)
  }

  const savedAtPlayhead = useMemo(
    () => annotations.filter((a) => Math.abs(a.timestampSeconds - currentTime) < 0.25),
    [annotations, currentTime],
  )

  const savedShapes = useMemo(
    () => savedAtPlayhead.flatMap((a) => a.shapes),
    [savedAtPlayhead],
  )

  const setDrawing = (on: boolean) => {
    setDrawMode(on)
    onDrawModeChange?.(on)
  }

  const startDrawing = () => {
    videoRef.current?.pause()
    setDrawing(true)
    // The toolbar appears below the frame; make sure both are on screen.
    requestAnimationFrame(() =>
      stageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  }

  const stopDrawing = () => {
    setDrawing(false)
    setLiveShapes([])
  }

  const saveFrame = () => {
    if (liveShapes.length === 0) return
    onAddAnnotation?.({ timestampSeconds: currentTime, shapes: liveShapes, label: '' })
    setLiveShapes([])
    setDrawing(false)
  }

  return (
    <div className={`stage${drawMode ? ' drawing' : ''}`} ref={stageRef}>
      <div className="stage-frame">
        <div className="stage-media" style={{ '--ar': String(aspect) } as CSSProperties}>
          <video
            ref={videoRef}
            src={src}
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onDurationChange={onDurationChange}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onClick={togglePlay}
          />
          <Annotator
            shapes={savedShapes}
            draft={liveShapes}
            tool={tool}
            color={color}
            onDraftChange={drawMode ? setLiveShapes : undefined}
          />
        </div>
      </div>

      <div className="stage-controls">
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Scrub through the swing"
        />

        {annotations.length > 0 && duration > 0 && (
          <div className="markers">
            {annotations.map((a) => (
              <button
                key={a.id}
                type="button"
                className="marker"
                style={{ left: `${Math.min(100, (a.timestampSeconds / duration) * 100)}%` }}
                onClick={() => seekTo(a.timestampSeconds)}
                title={`Annotation at ${timecode(a.timestampSeconds)}`}
                aria-label={`Jump to annotation at ${timecode(a.timestampSeconds)}`}
              />
            ))}
          </div>
        )}

        <div className="stage-row">
          <button type="button" className="stage-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
          </button>
          <button
            type="button"
            className="stage-btn"
            onClick={() => seekTo(currentTime - FRAME_STEP)}
            aria-label="Back one frame"
          >
            ◀|
          </button>
          <button
            type="button"
            className="stage-btn"
            onClick={() => seekTo(currentTime + FRAME_STEP)}
            aria-label="Forward one frame"
          >
            |▶
          </button>
          <span className="stage-time mono-num">
            {timecode(currentTime)} / {timecode(duration)}
          </span>
        </div>

        <div className="stage-row">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`stage-btn${speed === s ? ' active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s === 1 ? '1×' : `${s}×`}
            </button>
          ))}
        </div>

        {editable && !drawMode && (
          <div className="stage-row">
            <button type="button" className="stage-btn" onClick={startDrawing}>
              <PenIcon width={16} height={16} />
              Freeze frame &amp; draw
            </button>
            {savedAtPlayhead.length > 0 && onDeleteAnnotation && (
              <button
                type="button"
                className="stage-btn"
                onClick={() => savedAtPlayhead.forEach((a) => onDeleteAnnotation(a.id))}
                aria-label="Delete the annotation on this frame"
              >
                <TrashIcon width={16} height={16} />
              </button>
            )}
          </div>
        )}

        {editable && drawMode && (
          <>
            <div className="stage-row">
              {TOOLS.map(({ kind, label, Icon }) => (
                <button
                  key={kind}
                  type="button"
                  className={`stage-btn${tool === kind ? ' active' : ''}`}
                  onClick={() => setTool(kind)}
                  aria-pressed={tool === kind}
                >
                  <Icon width={16} height={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="stage-row">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Use the ${c} pen`}
                />
              ))}
              <button
                type="button"
                className="stage-btn"
                onClick={() => setLiveShapes((prev) => prev.slice(0, -1))}
                disabled={liveShapes.length === 0}
                aria-label="Undo the last mark"
              >
                <UndoIcon width={16} height={16} />
              </button>
            </div>
            {tool === 'angle' && (
              <p className="stage-hint">Tap three points: start, corner, end.</p>
            )}
            <div className="stage-row">
              <button type="button" className="stage-btn" onClick={stopDrawing}>
                Cancel
              </button>
              <button
                type="button"
                className="stage-btn active"
                onClick={saveFrame}
                disabled={liveShapes.length === 0}
              >
                Save this frame
              </button>
            </div>
          </>
        )}

        {!editable && annotations.length > 0 && (
          <p className="stage-hint">
            {annotations.length} annotated {annotations.length === 1 ? 'frame' : 'frames'} — tap a
            marker above the controls to jump to one.
          </p>
        )}
      </div>
    </div>
  )
}
