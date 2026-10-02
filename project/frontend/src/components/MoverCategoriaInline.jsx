import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import { API_URL } from '../config'
import { opcionesDestino } from '../utils/categoriaInline'

export { RUTA_SIN_CATEGORIZAR, esSinCategorizar } from '../utils/categoriaInline'

/**
 * Selector inline para recategorizar una hoja de "Sin categorizar" sin abrir el
 * modal completo (#11a) + sugerencia de IA bajo demanda (#11b).
 *
 * - Mover reusa el PATCH existente (store.updateHoja -> PATCH /hojas/{id}), que
 *   en el backend mueve el .md de carpeta en la Bóveda y actualiza la fila.
 * - "Sugerir con IA" llama a GET /hojas/{id}/sugerir-categoria, que reusa el
 *   clasificador del triage de Inbox con el modelo LOCAL (el contenido no sale a
 *   un modelo externo). La IA solo SUGIERE: el usuario confirma con un clic. Si
 *   la nota es solo un link o tiene poco contenido, no sugiere y lo dice; si
 *   Ollama no responde, degrada sin error.
 */
export default function MoverCategoriaInline({ hoja }) {
  const categorias = useStore((s) => s.categorias)
  const updateHoja = useStore((s) => s.updateHoja)
  const showToast = useStore((s) => s.showToast)
  const lang = useStore((s) => s.lang)
  const [moving, setMoving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [sugerencia, setSugerencia] = useState(null) // { suficiente, categoria_id, categoria_nombre }

  const opciones = useMemo(() => opcionesDestino(categorias), [categorias])

  const mover = async (categoriaId, labelConocida) => {
    if (!categoriaId || moving) return
    setMoving(true)
    const destino = opciones.find((o) => o.id === categoriaId)
    try {
      await updateHoja(hoja.id, { categoria_id: categoriaId })
      showToast(t(lang, 'bovedaMovida').replace('{cat}', destino?.label || labelConocida || ''))
    } catch {
      showToast(t(lang, 'bovedaMoverError'), 'error')
    } finally {
      setMoving(false)
    }
  }

  const sugerir = async () => {
    if (suggesting) return
    setSuggesting(true)
    setSugerencia(null)
    try {
      const res = await fetch(`${API_URL}/hojas/${hoja.id}/sugerir-categoria`)
      if (!res.ok) throw new Error('sugerencia falló')
      setSugerencia(await res.json())
    } catch {
      // Degrada sin error crudo: simplemente no hay sugerencia.
      setSugerencia({ suficiente: true, categoria_id: null })
    } finally {
      setSuggesting(false)
    }
  }

  // Texto/CTA según el resultado de la sugerencia.
  let sugerenciaUI = null
  if (sugerencia) {
    if (sugerencia.suficiente === false) {
      sugerenciaUI = (
        <span className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'bovedaSinDescripcion')}
        </span>
      )
    } else if (sugerencia.categoria_id) {
      const label = sugerencia.categoria_nombre || ''
      sugerenciaUI = (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); mover(sugerencia.categoria_id, label) }}
          className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full border transition-colors"
          style={{
            color: 'var(--accent-light)',
            borderColor: 'color-mix(in oklch, var(--accent) 30%, transparent)',
            background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
          }}
        >
          <Sparkles size={10} /> {t(lang, 'bovedaMoverSugerido').replace('{cat}', label)}
        </button>
      )
    } else {
      sugerenciaUI = (
        <span className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'bovedaSinSugerencia')}
        </span>
      )
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <select
          aria-label={t(lang, 'bovedaMoverA')}
          disabled={moving}
          value=""
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => mover(parseInt(e.target.value, 10))}
          className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded-md border outline-none bg-transparent cursor-pointer disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface)' }}
        >
          <option value="" disabled>
            {moving ? t(lang, 'saving') : t(lang, 'bovedaMoverA')}
          </option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          title={t(lang, 'bovedaSugerirIA')}
          aria-label={t(lang, 'bovedaSugerirIA')}
          disabled={suggesting}
          onClick={(e) => { e.stopPropagation(); sugerir() }}
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--accent-light)', background: 'var(--surface)' }}
        >
          <Sparkles size={12} className={suggesting ? 'animate-pulse' : ''} />
        </button>
      </div>
      {suggesting && (
        <span className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'bovedaSugiriendo')}
        </span>
      )}
      {!suggesting && sugerenciaUI}
    </div>
  )
}
