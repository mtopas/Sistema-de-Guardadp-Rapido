import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LEAF_ICON_MAP } from './leafIcons'

// Cache: "iconKey|color" → HTMLImageElement
const cache = {}

/**
 * Returns a cached HTMLImageElement for a Lucide icon key, ready to use with
 * ctx.drawImage(). Renders the React component synchronously via flushSync +
 * XMLSerializer the first time, then serves from cache.
 */
export function getIconImg(iconKey, color = '#ffffff') {
  const k = `${iconKey}|${color}`
  if (cache[k]) return cache[k]

  const Icon = LEAF_ICON_MAP[iconKey] || LEAF_ICON_MAP.FileText
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  flushSync(() => root.render(createElement(Icon, { size: 24, color, strokeWidth: 2 })))
  const svg = div.querySelector('svg')
  root.unmount()
  document.body.removeChild(div)
  if (!svg) return null

  const xml = new XMLSerializer().serializeToString(svg)
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  const img = new Image()
  img.src = dataUrl           // SVG data URLs load synchronously in all modern browsers
  cache[k] = img
  return img
}
