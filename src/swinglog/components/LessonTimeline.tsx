import { useSwingLog } from '../store'
import { drillsForLesson, faultIdsForLesson, videoForLesson } from '../selectors'
import { faultName } from '../taxonomy'
import { formatDate, formatRelative } from '../format'
import { hrefFor } from '../router'
import type { Lesson } from '../types'
import { Thumb } from './Thumb'
import { CloudIcon, FilmIcon, PhoneIcon } from '../icons'

export function LessonTimeline({ lessons }: { lessons: Lesson[] }) {
  const { data } = useSwingLog()

  if (lessons.length === 0) {
    return (
      <div className="empty">
        <span className="glyph">
          <FilmIcon width={26} height={26} />
        </span>
        <h3>Nothing logged yet</h3>
        <p>The first lesson you log will show up here with its video and diagnosis.</p>
      </div>
    )
  }

  return (
    <div className="timeline">
      {lessons.map((lesson) => {
        const video = videoForLesson(data, lesson.id)
        const faults = faultIdsForLesson(data, lesson.id)
        const drills = drillsForLesson(data, lesson.id)
        const openDrills = drills.filter((d) => d.assignment.completedAt === null).length

        return (
          <div className="timeline-item" key={lesson.id}>
            <a className="card lesson-card" href={hrefFor({ name: 'lesson', lessonId: lesson.id })}>
              <Thumb thumbKey={video?.thumbKey} alt={`Swing from ${formatDate(lesson.lessonDate)}`} />
              <div className="grow">
                <div className="row between" style={{ gap: 8 }}>
                  <strong style={{ fontSize: '0.92rem' }}>{formatDate(lesson.lessonDate)}</strong>
                  <span className="tiny faint">{formatRelative(lesson.lessonDate)}</span>
                </div>

                {faults.length > 0 ? (
                  <div className="chips" style={{ marginTop: 8 }}>
                    {faults.slice(0, 3).map((id) => (
                      <span key={id} className="chip static">
                        {faultName(id)}
                      </span>
                    ))}
                    {faults.length > 3 && <span className="pill">+{faults.length - 3}</span>}
                  </div>
                ) : (
                  <p className="tiny faint" style={{ margin: '8px 0 0' }}>
                    No diagnosis recorded
                  </p>
                )}

                {lesson.note && (
                  <p className="tiny muted truncate" style={{ margin: '8px 0 0' }}>
                    {lesson.note}
                  </p>
                )}

                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {drills.length > 0 && (
                    <span className={`pill${openDrills === 0 ? ' done' : ''}`}>
                      {openDrills === 0
                        ? `${drills.length} ${drills.length === 1 ? 'drill' : 'drills'} done`
                        : `${openDrills} of ${drills.length} drills open`}
                    </span>
                  )}
                  {video && (
                    <span className="pill">
                      {video.uploadState === 'uploaded' ? (
                        <>
                          <CloudIcon width={12} height={12} />
                          Backed up
                        </>
                      ) : (
                        <>
                          <PhoneIcon width={12} height={12} />
                          On this device
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </a>
          </div>
        )
      })}
    </div>
  )
}
