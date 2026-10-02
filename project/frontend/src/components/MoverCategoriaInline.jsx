import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import { opcionesDestino } from '../utils/categoriaInline'

export { RUTA_SIN_CATEGORIZAR, esSinCategorizar } from '../utils/categoriaInline'

/**
 * Selector inline para recategorizar una hoja de "Sin categorizar" sin abrir el
 * modal completo (#11a). Mover una hoja reusa el PATCH existente
 * (store.updateHoja -> PATCH /hojas/{id}), que en el backend mueve el .md de
 * carpeta en la Bóveda y actualiza la fila. Optimista con rollback vía store.
 */
export default function MoverCategoriaInline({ hoja }) {
  const categorias = useStore((s) => s.categorias)
  const updateHoja = useStore((s) => s.updateHoja)
  const showToast = useStore((s) => s.showToast)
  const lang = useStore((s) => s.lang)
  const [moving, setMoving] = useState(false)

  const opciones = useMemo(() => opcionesDestino(categorias), [categorias])

  const mover = async (categoriaId) => {
    if (!categoriaId || moving) return
    setMoving(true)
    const destino = opciones.find((o) => o.id === categoriaId)
    try {
      await updateHoja(hoja.id, { categoria_id: categoriaId })
      showToast(t(lang, 'bovedaMovida').replace('{cat}', destino?.label || ''))
    } catch {
      showToast(t(lang, 'bovedaMoverError'), 'error')
    } finally {
      setMoving(false)
    }
  }

  return (
    <select
      aria-label={t(lang, 'bovedaMoverA')}
      disabled={moving}
      value=""
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => mover(parseInt(e.target.value, 10))}
      className="w-full text-[11px] px-2 py-1 rounded-md border outline-none bg-transparent cursor-pointer disabled:opacity-50"
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
  )
}
