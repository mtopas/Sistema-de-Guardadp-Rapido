import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { API_URL, DEBUG } from '../config'

export default function LinkPreview({ url, preview: cachedPreview }) {
  const [preview, setPreview] = useState(cachedPreview || null)
  const [loading, setLoading] = useState(!cachedPreview)

  useEffect(() => {
    if (cachedPreview) {
      setPreview(cachedPreview)
      setLoading(false)
      return
    }
    if (!url) return
    setLoading(true)
    setPreview(null)
    fetch(`${API_URL}/preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (DEBUG) console.log('preview:', data)
        setPreview(data)
      })
      .catch(() => setPreview(null))
      .finally(() => setLoading(false))
  }, [url, cachedPreview])

  if (loading) return (
    <div className="h-20 bg-app-surface rounded-xl border border-app-border animate-pulse" />
  )
  if (!preview?.title) return null

  let hostname = ''
  try { hostname = new URL(url).hostname } catch (_) {}

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 bg-app-surface rounded-xl border border-app-border hover:border-app-accent transition-colors duration-150 group"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-app-bg"
          onError={e => { e.target.style.display = 'none' }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <p className="text-app-text text-sm font-medium line-clamp-2 leading-snug">
            {preview.title}
          </p>
        </div>
        {preview.description && (
          <p className="text-app-subtext text-xs mt-1 line-clamp-2 leading-snug">
            {preview.description}
          </p>
        )}
        {hostname && (
          <p className="text-app-accent text-xs mt-1.5 flex items-center gap-1">
            <ExternalLink size={10} />
            {hostname}
          </p>
        )}
      </div>
    </a>
  )
}
