import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtUSD, contribucionFireUSD, mesMovimiento } from '../../data/finanzas'
import {
  fireFormFromConfig,
  fireFormDirty,
  mergeFireCfg,
  parseFireForm,
} from './fireConfigUtils'

function KpiBox({ label, value, valueColor }) {
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-0.5 min-w-0 overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 60%, transparent)' }}
    >
      <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--subtext)' }}>
        {label}
      </div>
      <div
        className="serif italic font-semibold tnum leading-tight break-words"
        style={{
          fontSize: 15,
          color: valueColor ?? 'var(--text)',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function nextMes(m) {
  const [y, mo] = m.split('-').map(Number)
  if (mo === 12) return `${y + 1}-01`
  return `${y}-${String(mo + 1).padStart(2, '0')}`
}

const MES_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function fmtFireMes(m) {
  if (!m?.trim()) return '—'
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  return `${MES_NAMES[mo - 1]} ${y}`
}

function fmtFireFecha(iso, lang) {
  if (!iso?.trim()) return '—'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtFirePct(v) {
  if (v === '' || v == null) return '—'
  const n = parseFloat(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return '—'
  return `${n % 1 === 0 ? n : n.toFixed(2).replace(/\.?0+$/, '')}%`
}

function fmtFireUSDShort(n) {
  const x = Number(n) || 0
  const sign = x < 0 ? '−' : ''
  const abs = Math.abs(x)
  if (abs >= 1_000_000) {
    return `${sign}US$ ${(abs / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  }
  if (abs >= 1_000) {
    return `${sign}US$ ${(abs / 1_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`
  }
  return fmtUSD(x)
}

function SavedField({ label, value, isLast = false }) {
  return (
    <div
      className="flex flex-col gap-1 py-1.5 min-w-0 w-full"
      style={{
        borderBottom: isLast
          ? 'none'
          : '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
      }}
    >
      <span
        className="block w-full"
        style={{
          fontSize: 10,
          color: 'var(--subtext)',
          lineHeight: 1.45,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {label}
      </span>
      <span
        className="tnum leading-snug block w-full"
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
          fontWeight: 600,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export default function FireRightPanel() {
  const lang               = useStore(s => s.lang)
  const finConfig          = useStore(s => s.finConfig)
  const finFirePreview     = useStore(s => s.finFirePreview)
  const saveConfigBulk     = useStore(s => s.saveFinConfigBulk)
  const setFinFirePreview  = useStore(s => s.setFinFirePreview)
  const clearFinFirePreview = useStore(s => s.clearFinFirePreview)
  const finFireFilas       = useStore(s => s.finFireFilas)
  const finMovAll          = useStore(s => s.finMovimientosAll)

  const cfg = useMemo(
    () => mergeFireCfg(finConfig, finFirePreview),
    [finConfig, finFirePreview],
  )

  const [form, setForm] = useState(() => fireFormFromConfig(finConfig ?? {}))
  const [editing, setEditing] = useState(true)
  const skipPreviewRef = useRef(true)
  const autoViewRef = useRef(false)

  const savedForm = useMemo(() => fireFormFromConfig(finConfig ?? {}), [finConfig])
  const isDirty = useMemo(() => fireFormDirty(form, finConfig), [form, finConfig])
  const hasPersistedFire = useMemo(
    () => Object.values(savedForm).some(v => String(v).trim() !== ''),
    [savedForm],
  )
  const canSave = isDirty || !hasPersistedFire

  // Primera carga con config persistida → modo vista
  useEffect(() => {
    if (autoViewRef.current) return
    if (!finConfig || Object.keys(finConfig).length === 0) return
    const saved = fireFormFromConfig(finConfig)
    const hasSaved = Object.values(saved).some(v => String(v).trim() !== '')
    if (hasSaved) {
      setEditing(false)
      autoViewRef.current = true
    }
  }, [finConfig])

  // Hidratar desde config guardada (no pisa edición en curso ni preview stale)
  useEffect(() => {
    if (!finConfig || Object.keys(finConfig).length === 0) return
    setForm(prev => {
      if (fireFormDirty(prev, finConfig)) return prev
      skipPreviewRef.current = true
      clearFinFirePreview()
      return fireFormFromConfig(finConfig)
    })
  }, [finConfig, clearFinFirePreview])

  // Al salir de FIRE: descartar preview no guardado
  useEffect(() => () => clearFinFirePreview(), [clearFinFirePreview])

  // Vista previa en FireTab solo mientras editás (no al montar/hidratar)
  useEffect(() => {
    if (!editing) {
      clearFinFirePreview()
      return
    }
    if (skipPreviewRef.current) {
      skipPreviewRef.current = false
      return
    }
    if (!isDirty) {
      clearFinFirePreview()
      return
    }
    setFinFirePreview(parseFireForm(form))
  }, [form, finConfig, editing, isDirty, setFinFirePreview, clearFinFirePreview])

  const [saveState, setSaveState] = useState('idle')

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (saveState === 'saving' || !canSave) return
    const updates = parseFireForm(form, { forSave: true })

    setSaveState('saving')
    try {
      await saveConfigBulk(updates)
      skipPreviewRef.current = true
      clearFinFirePreview()
      setEditing(false)
      setSaveState('ok')
    } catch {
      setSaveState('err')
    } finally {
      setTimeout(() => setSaveState('idle'), 2000)
    }
  }

  const handleEdit = () => {
    skipPreviewRef.current = true
    setForm(fireFormFromConfig(finConfig ?? {}))
    clearFinFirePreview()
    setEditing(true)
    setSaveState('idle')
  }

  const handleCancelEdit = () => {
    skipPreviewRef.current = true
    setForm(fireFormFromConfig(finConfig ?? {}))
    clearFinFirePreview()
    setEditing(false)
    setSaveState('idle')
  }

  const inp = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label style={{ fontSize: 10, color: 'var(--subtext)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={e => setF(key, e.target.value)}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          color: 'var(--text)', borderRadius: 8, padding: '5px 8px', fontSize: 12,
          fontFamily: 'var(--font-mono)', outline: 'none',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )

  const currentMes = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const ahorroPorMes = useMemo(() => {
    const dolar = cfg.dolar_mep ?? cfg.dolar_oficial ?? cfg.dolar_default ?? 1245
    const map = {}
    finMovAll.forEach(m => {
      const mes = mesMovimiento(m)
      if (!mes) return
      const delta = contribucionFireUSD(m, dolar)
      if (delta) map[mes] = (map[mes] ?? 0) + delta
    })
    return map
  }, [finMovAll, cfg])

  const resumen = useMemo(() => {
    const aporteInicial      = cfg.fire_aporte_inicial ?? 0
    const saldoInicial       = cfg.fire_saldo_inicial  ?? 0
    const aumentoMensual     = (cfg.fire_aumento_aporte    ?? 1.20) / 100
    const rentabilidadMensual = (cfg.fire_rentabilidad_anual ?? 6.00) / 100 / 12
    const inicioMes           = cfg.fire_inicio_mes || currentMes
    const dolar               = cfg.dolar_mep ?? cfg.dolar_oficial ?? cfg.dolar_default ?? 1245
    const metaUSD             = cfg.fire_meta_usd   ?? 500000

    let prevAportePlan = aporteInicial
    let saldo          = saldoInicial
    let mes            = inicioMes
    let totalAhorrado  = 0

    while (mes <= currentMes) {
      const aporte = mes === inicioMes ? aporteInicial : prevAportePlan * (1 + aumentoMensual)
      const computed = ahorroPorMes[mes] ?? 0
      const override = finFireFilas[mes]
      const ahorrado = computed > 0 ? computed : (override !== undefined ? override : 0)
      const interes  = (saldo + ahorrado) * rentabilidadMensual
      saldo = saldo + ahorrado + interes
      prevAportePlan = aporte
      totalAhorrado += ahorrado
      mes = nextMes(mes)
    }

    let proyMes = currentMes
    let proySaldo = saldo
    let proyAporte = prevAportePlan
    let anioFIRE = null
    for (let i = 0; i < 50 * 12; i++) {
      if (proySaldo >= metaUSD) {
        anioFIRE = proyMes.split('-')[0]
        break
      }
      const intr  = (proySaldo + proyAporte) * rentabilidadMensual
      proySaldo   = proySaldo + proyAporte + intr
      proyAporte  = proyAporte * (1 + aumentoMensual)
      proyMes     = nextMes(proyMes)
    }

    const tasaPromedio = finMovAll
      .filter(m => (m.type ?? m.tipo) === 'income' && (m.cat ?? m.categoria_nombre ?? '') !== 'Transferencia')
      .length > 0
      ? (() => {
          const ingresos = finMovAll
            .filter(m => (m.type ?? m.tipo) === 'income')
            .reduce((s, m) => s + Math.abs(m.amount ?? m.monto ?? 0), 0)
          const gastos = finMovAll
            .filter(m => (m.type ?? m.tipo) === 'expense')
            .reduce((s, m) => s + Math.abs(m.amount ?? m.monto ?? 0), 0)
          return ingresos > 0 ? Math.round(((ingresos - gastos) / ingresos) * 100) : 0
        })()
      : 0

    return { saldoAcum: saldo, anioFIRE, tasaPromedio }
  }, [cfg, finFireFilas, ahorroPorMes, currentMes, finMovAll])

  const savedFields = (
    <>
      <SavedField
        label={t(lang, 'fireMetaUSD')}
        value={savedForm.fire_meta_usd ? fmtFireUSDShort(parseFloat(savedForm.fire_meta_usd)) : '—'}
      />
      <SavedField
        label={t(lang, 'fireMetaEdad')}
        value={savedForm.fire_meta_edad
          ? `${savedForm.fire_meta_edad} ${lang === 'en' ? 'yrs' : 'años'}`
          : '—'}
      />
      <SavedField label={t(lang, 'fireAumentoAporte')} value={fmtFirePct(savedForm.fire_aumento_aporte)} />
      <SavedField label={t(lang, 'fireRentabilidad')} value={fmtFirePct(savedForm.fire_rentabilidad_anual)} />
      <SavedField label={t(lang, 'fireFechaNac')} value={fmtFireFecha(savedForm.fire_fecha_nacimiento, lang)} />
      <SavedField
        label={t(lang, 'fireAporteInicial')}
        value={savedForm.fire_aporte_inicial ? fmtUSD(parseFloat(savedForm.fire_aporte_inicial)) : '—'}
      />
      <SavedField
        label={t(lang, 'fireSaldoInicial')}
        value={savedForm.fire_saldo_inicial ? fmtUSD(parseFloat(savedForm.fire_saldo_inicial)) : '—'}
      />
      <SavedField
        label={t(lang, 'fireInicioMes')}
        value={fmtFireMes(savedForm.fire_inicio_mes)}
        isLast
      />
    </>
  )

  return (
    <aside
      className="w-[280px] shrink-0 h-full min-h-0 overflow-y-auto panel-scroll flex flex-col gap-3 px-3.5 py-5"
      style={{
        borderLeft: '1px solid var(--border)',
        background: 'var(--panel-bg)',
      }}
    >
      <div className="shrink-0 flex flex-col gap-3">
        <div className="label">{t(lang, 'fireResumen')}</div>
        <KpiBox label={t(lang,'fireSaldoAcum')} value={fmtFireUSDShort(resumen.saldoAcum)} />
        <KpiBox label={t(lang,'fireAnioFIRE')} value={resumen.anioFIRE ?? '—'} valueColor="var(--accent)" />
        <KpiBox label={t(lang,'fireTasaReal')} value={`${resumen.tasaPromedio}%`} />
        <hr style={{ borderColor: 'var(--border)', margin: 0 }} />
      </div>

      <div className="flex flex-col min-h-0 flex-1 gap-2">
        <div className="label shrink-0">{t(lang, 'fireConfigTitle')}</div>

        {editing ? (
          <div className="flex flex-col gap-2.5 min-h-0 flex-1 overflow-y-auto panel-scroll pr-0.5">
            {inp(t(lang,'fireMetaUSD'),           'fire_meta_usd',           'number', '500000')}
            {inp(t(lang,'fireMetaEdad'),          'fire_meta_edad',          'number', '45')}
            {inp(t(lang,'fireAumentoAporte'),     'fire_aumento_aporte',     'number', '1.20')}
            {inp(t(lang,'fireRentabilidad'),      'fire_rentabilidad_anual', 'number', '6.00')}
            {inp(t(lang,'fireFechaNac'),          'fire_fecha_nacimiento',   'date')}
            {inp(t(lang,'fireAporteInicial'),     'fire_aporte_inicial',     'number', '0')}
            {inp(t(lang,'fireSaldoInicial'),      'fire_saldo_inicial',      'number', '0')}
            {inp(t(lang,'fireInicioMes'),         'fire_inicio_mes',         'month')}
          </div>
        ) : (
          <div
            className="rounded-xl border flex flex-col min-h-0 flex-1 min-w-0"
            style={{
              borderColor: 'color-mix(in oklch, var(--success, #22c55e) 35%, var(--border))',
              background: 'color-mix(in oklch, var(--success, #22c55e) 8%, var(--bg))',
            }}
          >
            <div
              className="flex items-center gap-1.5 shrink-0 px-3 pt-2.5 pb-2 mx-0"
              style={{
                borderBottom: '1px solid color-mix(in oklch, var(--success, #22c55e) 25%, var(--border))',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--success, #22c55e)',
              }}
            >
              <span aria-hidden>✓</span>
              {t(lang, 'fireConfigGuardada')}
            </div>
            <div className="flex flex-col min-h-0 flex-1 overflow-y-auto panel-scroll px-3 py-2 pb-2.5">
              {savedFields}
            </div>
          </div>
        )}

        {editing ? (
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || !canSave}
            className="w-full py-2 rounded-xl text-[12.5px] font-semibold"
            style={{
              background: saveState === 'err' ? '#ef4444' : 'var(--cta-bg)',
              color: 'var(--cta-text)',
              border: 'none',
              cursor: saveState === 'saving' ? 'wait' : (!canSave ? 'default' : 'pointer'),
              opacity: saveState === 'saving' ? 0.7 : (!canSave ? 0.45 : 1),
              transition: 'opacity 0.2s',
            }}
          >
            {saveState === 'saving' ? 'Guardando…'
             : saveState === 'err' ? 'Error al guardar'
             : t(lang, 'fireGuardarConfig')}
          </button>
          {!isDirty && hasPersistedFire && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="w-full py-1.5 text-[11px] font-medium"
              style={{ background: 'none', border: 'none', color: 'var(--subtext)', cursor: 'pointer' }}
            >
              {t(lang, 'fireCancelarEdicion')}
            </button>
          )}
        </div>
        ) : (
          <button
            onClick={handleEdit}
            className="w-full py-2 rounded-xl text-[12.5px] font-semibold shrink-0"
            style={{
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {t(lang, 'fireEditarConfig')}
          </button>
        )}
      </div>
    </aside>
  )
}
