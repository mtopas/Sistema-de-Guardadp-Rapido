import { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, X, Check } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD, contribucionFire, acumuladoPorCategoriaNombre, mesMovimiento } from '../../data/finanzas'

function ProgressBar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color ?? 'var(--cta-bg)' }}
      />
    </div>
  )
}

function KpiBox({ label, value, sub, valueColor }) {
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-0.5"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 60%, transparent)' }}
    >
      <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--subtext)' }}>
        {label}
      </div>
      <div className="serif italic font-semibold tnum leading-tight" style={{ fontSize: 16, color: valueColor ?? 'var(--text)' }}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>{sub}</div>}
    </div>
  )
}

// ── Nuevo objetivo form ───────────────────────────────────────────────────────

function NuevoObjetivoForm({ onSave, onCancel, lang }) {
  const [f, setF] = useState({ nombre: '', meta: '', moneda: 'ARS', fecha_limite: '', cuota_mensual: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const inp = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label style={{ fontSize: 10, color: 'var(--subtext)', display: 'block', marginBottom: 2 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={f[key]}
        onChange={e => set(key, e.target.value)}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
          borderRadius: 8, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )

  const handleSave = () => {
    if (!f.nombre || !f.meta) return
    onSave({
      nombre: f.nombre,
      meta: parseFloat(f.meta) || 0,
      moneda: f.moneda,
      fecha_limite: f.fecha_limite || null,
      cuota_mensual: f.cuota_mensual ? parseFloat(f.cuota_mensual) : null,
    })
  }

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{ borderColor: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 5%, var(--surface))' }}
    >
      {inp(t(lang, 'objNombre'), 'nombre', 'text', 'Viaje a Europa')}
      <div className="flex gap-2">
        <div className="flex-1">{inp(t(lang, 'objMeta'), 'meta', 'number', '0')}</div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--subtext)', display: 'block', marginBottom: 2 }}>{t(lang,'objMoneda')}</label>
          <select
            value={f.moneda}
            onChange={e => set('moneda', e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none' }}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      {inp(t(lang, 'objFechaLimite'), 'fecha_limite', 'date')}
      {inp(t(lang, 'objCuota'), 'cuota_mensual', 'number', '0')}
      <div className="flex gap-2 mt-1">
        <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none', cursor: 'pointer' }}>
          <Check size={12} /> {t(lang,'guardar')}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-[12px]" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtext)', cursor: 'pointer' }}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Objetivo card ─────────────────────────────────────────────────────────────

function ObjetivoCard({ obj, acumulado, lang, onDelete }) {
  const pct       = obj.meta > 0 ? Math.min(100, (acumulado / obj.meta) * 100) : 0
  const completed = pct >= 100
  const falta     = Math.max(0, obj.meta - acumulado)

  const cuotaCalc = useMemo(() => {
    if (obj.cuota_mensual) return obj.cuota_mensual
    if (!obj.fecha_limite) return null
    const mesesRestantes = Math.max(1, Math.round((new Date(obj.fecha_limite) - new Date()) / (86400000 * 30.44)))
    return falta / mesesRestantes
  }, [obj, falta])

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 50%, transparent)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{obj.nombre}</div>
          {obj.fecha_limite && (
            <div className="text-[10px] mono" style={{ color: 'var(--subtext)' }}>
              → {new Date(obj.fecha_limite).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {completed && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#22c55e22', color: '#22c55e' }}>
              {t(lang,'objCompletado')}
            </span>
          )}
          <button
            onClick={onDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', padding: 2, lineHeight: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
          ><Trash2 size={12} /></button>
        </div>
      </div>

      <ProgressBar pct={pct} color={completed ? '#22c55e' : 'var(--cta-bg)'} />

      <div className="flex justify-between text-[10.5px] mono">
        <span style={{ color: 'var(--subtext)' }}>
          {obj.moneda === 'USD' ? fmtUSD(acumulado) : fmtARS(acumulado)} / {obj.moneda === 'USD' ? fmtUSD(obj.meta) : fmtARS(obj.meta)}
        </span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
      </div>

      {!completed && (
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--subtext)' }}>
          <span>{t(lang,'objFalta')}: {obj.moneda === 'USD' ? fmtUSD(falta) : fmtARS(falta)}</span>
          {cuotaCalc != null && <span>{t(lang,'objCuota')}: {fmtARS(cuotaCalc)}/mes</span>}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AhorroRightPanel() {
  const lang              = useStore(s => s.lang)
  const finObjetivos      = useStore(s => s.finObjetivos)
  const fetchObj          = useStore(s => s.fetchFinObjetivos)
  const addObj            = useStore(s => s.addFinObjetivo)
  const deleteObj         = useStore(s => s.deleteFinObjetivo)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const finConfig         = useStore(s => s.finConfig)
  const finFireFilas      = useStore(s => s.finFireFilas)
  const fetchFireFilas    = useStore(s => s.fetchFinFireFilas)

  const [addingObj, setAddingObj] = useState(false)

  useEffect(() => { fetchObj(); fetchFireFilas() }, [])

  // Compute aporte requerido FIRE del mes actual
  const currentMes = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const fireAporteActual = useMemo(() => {
    const cfg = finConfig ?? {}
    const aumento      = (cfg.fire_aumento_aporte ?? 1.20) / 100
    const aporteInicial = cfg.fire_aporte_inicial ?? 0
    const inicioMes     = cfg.fire_inicio_mes ?? currentMes

    // Aporte plan del mes actual: solo compuesto desde inicio (sin arrastrar faltas)
    let aporte = aporteInicial
    let mes    = inicioMes
    while (mes < currentMes) {
      aporte = aporte * (1 + aumento)
      mes    = nextMes(mes)
    }
    return aporte
  }, [finConfig, currentMes])

  function nextMes(m) {
    const [y, mo] = m.split('-').map(Number)
    if (mo === 12) return `${y + 1}-01`
    return `${y}-${String(mo + 1).padStart(2, '0')}`
  }

  const ahorradoFireMes = useMemo(() => {
    const computed = finMovimientosAll
      .filter(m => mesMovimiento(m) === currentMes)
      .reduce((sum, m) => sum + contribucionFire(m), 0)
    const override = finFireFilas[currentMes]
    if (computed !== 0) return computed
    if (override !== undefined) return override
    return 0
  }, [finMovimientosAll, finFireFilas, currentMes])

  const acumPorObj = useMemo(() => {
    const map = {}
    finObjetivos.forEach(o => {
      map[o.nombre] = acumuladoPorCategoriaNombre(finMovimientosAll, o.nombre)
    })
    return map
  }, [finMovimientosAll, finObjetivos])

  const pctFire = fireAporteActual > 0 ? Math.min(100, (ahorradoFireMes / fireAporteActual) * 100) : 0

  const handleSaveObj = async (payload) => {
    await addObj(payload)
    setAddingObj(false)
  }

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--panel-bg)',
        overflowY: 'auto',
        padding: '20px 14px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Meta FIRE este mes */}
      <div>
        <div className="label mb-2">{t(lang, 'metaFIREMes')}</div>
        <div
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 60%, transparent)' }}
        >
          <div className="flex justify-between items-baseline">
            <span className="text-[12px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtARS(ahorradoFireMes)}
            </span>
            <span className="text-[11px] mono" style={{ color: 'var(--subtext)' }}>
              / {fmtARS(fireAporteActual)}
            </span>
          </div>
          <ProgressBar pct={pctFire} color={pctFire >= 100 ? '#22c55e' : 'var(--cta-bg)'} />
          <div className="text-[10px] mono" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'metaFIREDesc')}
          </div>
        </div>
      </div>

      {/* Objetivos */}
      <div className="flex items-center justify-between">
        <div className="label">{t(lang, 'objetivosTitle')}</div>
        <button
          onClick={() => setAddingObj(v => !v)}
          className="text-[11px] font-medium px-2 py-0.5 rounded-lg"
          style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none', cursor: 'pointer' }}
        >
          {t(lang, 'addObjetivo')}
        </button>
      </div>

      {addingObj && (
        <NuevoObjetivoForm lang={lang} onSave={handleSaveObj} onCancel={() => setAddingObj(false)} />
      )}

      {finObjetivos.length === 0 && !addingObj ? (
        <p style={{ fontSize: 12, color: 'var(--subtext)' }}>{t(lang, 'sinObjetivos')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {finObjetivos.map(obj => (
            <ObjetivoCard
              key={obj.id}
              obj={obj}
              acumulado={acumPorObj[obj.nombre] ?? 0}
              lang={lang}
              onDelete={() => deleteObj(obj.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
