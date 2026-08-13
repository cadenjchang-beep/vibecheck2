import { FilmIcon } from '../icons'
import { useMediaUrl } from '../media'

export function Thumb({ thumbKey, alt }: { thumbKey: string | null | undefined; alt: string }) {
  const url = useMediaUrl(thumbKey)
  if (!url) {
    return (
      <div className="thumb" role="img" aria-label={alt}>
        <FilmIcon width={22} height={22} />
      </div>
    )
  }
  return <img className="thumb" src={url} alt={alt} loading="lazy" />
}
