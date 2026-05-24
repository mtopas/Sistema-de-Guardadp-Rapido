import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { HABITO_COLORS, parseDias, DIAS_SEMANA } from './habitosUtils'

const DIAS_LABELS = DIAS_SEMANA

export default function NuevoHabitoModal({ habito, onClose }) {
  const lang         = useStore(s => s.lang)
  const addHabito    = useStore(s => s.addHabito)
  const updateHabito = useStore(s => s.updateHabito)
  const habitos      = useStore(s => s.habitos)

  const isEdit = !!habito

  const [nombre,  setNombre]  = useState(habito?.nombre || '')
  const [desc,    setDesc]    = useState(habito?.descripcion || '')
  const [color,   setColor]   = useState(habito?.color || HABITO_COLORS[0])
  const [categ,   setCateg]   = useState(habito?.categoria || '')
  const [freq,    setFreq]    = useState(habito?.frecuencia_tipo || 'diario')
  const [dias,    setDias]    = useState(parseDias(habito?.dias_semana))
  const [hora,    setHora]    = useState(habito?.hora || '')
  const [activo,  setActivo]  = useState(habito?.activo !== false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // Autocomplete: unique categories from existing habits
  const categoriaOpts = useMemo(() => {
    const cats = habitos.map(h => h.categoria).filter(Boolean)
    return [...new Set(cats)].sort()
  }, [habitos])

  // Preview string for frecuencia
  const freqPreview = useMemo(() => {
    if (freq === 'diario') return hora ? `Todos los días · ${hora}` : 'Todos los días'
    if (dias.length === 0) return 'Sin días seleccionados'
    const labels = DIAS_LABELS.filter((_, i) => dias.includes(i))
    return hora ? `${labels.join(', ')} · ${hora}` : labels.join(', ')
  }, [freq, dias, hora])

  // Escape closes, Ctrl+Enter saves
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [nombre, desc, color, categ, freq, dias, hora, activo])

  function toggleDia(d) {
    setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    if (freq === 'semanal' && dias.length === 0) { setError('Elegí al menos un día'); return }
    setSaving(true)
    const payload = {
      nombre: nombre.trim(),
      descripcion: desc.trim() || null,
      color,
      categoria: categ.trim() || null,
      frecuencia_tipo: freq,
      dias_semana: freq === 'semanal' ? JSON.stringify(dias.sort()) : null,
      hora: hora || null,
      ...(isEdit ? { activo } : {}),
    }
    if (isEdit) {
      await updateHabito(habito.id, payload)
    } else {
      await addHabito(payload)
    }
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl border flex flex-col max-h-[90vh]"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[16px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Editar hábito' : 'Nuevo hábito'}
          </h2>
          <button onClick={onClose} className="icon-btn"><X size={16} /></button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto p-5 flex flex-col gap-4">

          {/* Nombre */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosNombre')}</label>
            <input
              type="text"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError('') }}
              placeholder="Ej: Meditar 10 min"
              className="w-full text-[13px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
              style={{ borderColor: error && !nombre ? 'var(--danger)' : 'var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = error && !nombre ? 'var(--danger)' : 'var(--border)'}
              autoFocus
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosDescripcion')}</label>
            <input
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: 10 min con los ojos cerrados"
              className="w-full text-[13px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Color */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosColor')}</label>
            <div className="flex gap-2 flex-wrap">
              {HABITO_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform duration-100"
                  style={{
                    background: c,
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Categoría con autocomplete */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosCategoria')}</label>
            <input
              type="text"
              list="habito-cats"
              value={categ}
              onChange={e => setCateg(e.target.value)}
              placeholder="Ej: Salud, Aprendizaje..."
              className="w-full text-[13px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <datalist id="habito-cats">
              {categoriaOpts.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Frecuencia */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosFrecuencia')}</label>
            <div
              className="flex gap-1 p-1 rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {[['diario', t(lang, 'habitosDiario')], ['semanal', t(lang, 'habitosSemanal')]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFreq(val)}
                  className="flex-1 text-[12px] py-1.5 rounded-lg transition-all duration-150"
                  style={{
                    background: freq === val ? 'var(--bg)' : 'transparent',
                    color: freq === val ? 'var(--text)' : 'var(--subtext)',
                    fontWeight: freq === val ? 600 : 500,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {freq === 'semanal' && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {DIAS_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDia(idx)}
                    className="w-9 h-9 rounded-xl text-[12px] font-medium transition-all duration-150"
                    style={{
                      background: dias.includes(idx) ? color : 'var(--surface)',
                      color: dias.includes(idx) ? 'white' : 'var(--subtext)',
                      border: `1px solid ${dias.includes(idx) ? color : 'var(--border)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Preview frecuencia en vivo */}
            <div className="mt-2 text-[11px] mono px-1" style={{ color: 'var(--accent)' }}>
              Toca: {freqPreview}
            </div>
          </div>

          {/* Hora */}
          <div>
            <label className="label mb-1.5 block">{t(lang, 'habitosHora')}</label>
            <input
              type="time"
              value={hora}
              onChange={e => setHora(e.target.value)}
              className="text-[13px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Toggle Activo — solo en modo edición */}
          {isEdit && (
            <div className="flex items-center justify-between py-2 px-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>Hábito activo</div>
                <div className="text-[11px]" style={{ color: 'var(--subtext)' }}>
                  {activo ? 'Aparece en la grilla y en Agenda' : 'Archivado — historial preservado'}
                </div>
              </div>
              <button
                onClick={() => setActivo(v => !v)}
                className="relative w-10 h-5.5 rounded-full transition-colors duration-200 shrink-0"
                style={{
                  width: 40, height: 22,
                  background: activo ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <span
                  className="absolute top-[3px] rounded-full bg-white transition-transform duration-200"
                  style={{
                    width: 16, height: 16,
                    left: 3,
                    transform: activo ? 'translateX(18px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>
          )}

          {error && (
            <p className="text-[12px]" style={{ color: 'var(--danger)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex gap-3" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="btn flex-1">
            {t(lang, 'habitosCancelar')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex-1"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Guardando...' : t(lang, 'habitosGuardar')}
          </button>
        </div>
      </div>
    </div>
  )
}
