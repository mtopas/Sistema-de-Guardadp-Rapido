import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS } from '../../data/finanzas'

function KpiBox({ label, value, valueColor }) {
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
    </div>
  )
}

function nextMes(m) {
  const [y, mo] = m.split('-').map(Number)
  if (mo === 12) return `${y + 1}-01`
  return `${y}-${String(mo + 1).padStart(2, '0')}`
}

function mesLabel(m) {
  if (!m) return '—'
  const [y, mo] = m.split('-').map(Number)
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[mo - 1]} ${y}`
}

export default function FireRightPanel() {
  const lang              = useStore(s => s.lang)
  const finConfig         = useStore(s => s.finConfig)
  const saveConfigBulk    = useStore(s => s.saveFinConfigBulk)
  const finFireFilas      = useStore(s => s.finFireFilas)
  const finMovAll         = useStore(s => s.finMovimientosAll)
  const finObjetivos      = useStore(s => s.finObjetivos)

  const cfg = finConfig ?? {}

  const [form, setForm] = useState({
    fire_aumento_aporte:     String(cfg.fire_aumento_aporte     ?? '1.20'),
    fire_rentabilidad_anual: String(cfg.fire_rentabilidad_anual ?? '6.00'),
    fire_fecha_nacimiento:   cfg.fire_fecha_nacimiento ?? '',
    fire_aporte_inicial:     String(cfg.fire_aporte_inicial     ?? '0'),
    fire_saldo_inicial:      String(cfg.fire_saldo_inicial      ?? '0'),
    fire_inicio_mes:         cfg.fire_inicio_mes ?? '',
    fire_meta_usd:           String(cfg.fire_meta_usd           ?? '500000'),
    fire_meta_edad:          String(cfg.fire_meta_edad           ?? ''),
  })

  useEffect(() => {
    if (!finConfig) return
    setForm({
      fire_aumento_aporte:     String(finConfig.fire_aumento_aporte     ?? '1.20'),
      fire_rentabilidad_anual: String(finConfig.fire_rentabilidad_anual ?? '6.00'),
      fire_fecha_nacimiento:   finConfig.fire_fecha_nacimiento ?? '',
      fire_aporte_inicial:     String(finConfig.fire_aporte_inicial     ?? '0'),
      fire_saldo_inicial:      String(finConfig.fire_saldo_inicial      ?? '0'),
      fire_inicio_mes:         finConfig.fire_inicio_mes ?? '',
      fire_meta_usd:           String(finConfig.fire_meta_usd           ?? '500000'),
      fire_meta_edad:          String(finConfig.fire_meta_edad           ?? ''),
    })
  }, [finConfig])

  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'ok' | 'err'

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (saveState === 'saving') return
    const updates = {
      fire_aumento_aporte:     parseFloat(form.fire_aumento_aporte)     || 1.20,
      fire_rentabilidad_anual: parseFloat(form.fire_rentabilidad_anual) || 6.00,
      fire_fecha_nacimiento:   form.fire_fecha_nacimiento,
      fire_aporte_inicial:     parseFloat(form.fire_aporte_inicial)     || 0,
      fire_saldo_inicial:      parseFloat(form.fire_saldo_inicial)      || 0,
      fire_meta_usd:           parseFloat(form.fire_meta_usd)           || 500000,
    }
    if (form.fire_inicio_mes) updates.fire_inicio_mes = form.fire_inicio_mes
    const metaEdad = parseInt(form.fire_meta_edad)
    if (!isNaN(metaEdad) && metaEdad > 0) updates.fire_meta_edad = metaEdad

    setSaveState('saving')
    try {
      await saveConfigBulk(updates)
      setSaveState('ok')
    } catch {
      setSaveState('err')
    } finally {
      setTimeout(() => setSaveState('idle'), 2000)
    }
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

  // Resumen: saldo acumulado real (last non-future row)
  const currentMes = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const objetivoNombres = useMemo(() => new Set(finObjetivos.map(o => o.nombre)), [finObjetivos])

  const ahorroPorMes = useMemo(() => {
    const map = {}
    finMovAll.forEach(m => {
      const cat  = m.cat ?? m.categoria_nombre ?? ''
      const desc = m.desc ?? m.descripcion ?? ''
      if (cat !== 'Ahorro' || objetivoNombres.has(desc)) return
      const v = m.date ?? m.fecha ?? ''
      const d = new Date(v)
      if (isNaN(d.getTime())) return
      const mes   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const monto = Math.abs(m.amount ?? m.monto ?? 0)
      map[mes] = (map[mes] ?? 0) + ((m.type ?? m.tipo) === 'expense' ? monto : -monto)
    })
    return map
  }, [finMovAll, objetivoNombres])

  const resumen = useMemo(() => {
    const aporteInicial      = cfg.fire_aporte_inicial ?? 0
    const saldoInicial       = cfg.fire_saldo_inicial  ?? 0
    const aumentoMensual     = (cfg.fire_aumento_aporte    ?? 1.20) / 100
    const rentabilidadMensual = (cfg.fire_rentabilidad_anual ?? 6.00) / 100 / 12
    const inicioMes           = cfg.fire_inicio_mes || currentMes
    const dolar               = cfg.dolar_mep ?? cfg.dolar_oficial ?? cfg.dolar_default ?? 1245
    const metaUSD             = cfg.fire_meta_usd   ?? 500000

    let prevAporte     = aporteInicial
    let prevFalta      = 0
    let saldo          = saldoInicial
    let mes            = inicioMes
    let totalAhorrado  = 0
    let mesesReales    = 0

    while (mes <= currentMes) {
      const aporte = mes === inicioMes ? aporteInicial : prevAporte * (1 + aumentoMensual) + prevFalta
      const ahorrado = finFireFilas[mes] !== undefined ? finFireFilas[mes] : (ahorroPorMes[mes] ?? 0)
      const interes  = (saldo + ahorrado) * rentabilidadMensual
      saldo = saldo + ahorrado + interes
      const falta = Math.max(0, aporte - ahorrado)
      prevAporte = aporte
      prevFalta  = falta
      totalAhorrado += ahorrado
      if (ahorrado > 0) mesesReales++
      mes = nextMes(mes)
    }

    // Project from current saldo to find FIRE year
    const saldoMetaARS  = metaUSD * dolar
    let proyMes = currentMes
    let proySaldo = saldo
    let proyAporte = prevAporte
    let anioFIRE = null
    for (let i = 0; i < 50 * 12; i++) {
      if (proySaldo >= saldoMetaARS) {
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

  return (
    <div
      style={{
        width: 256,
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
      {/* Resumen */}
      <div className="label">{t(lang, 'fireResumen')}</div>
      <KpiBox label={t(lang,'fireSaldoAcum')} value={fmtARS(resumen.saldoAcum)} />
      <KpiBox label={t(lang,'fireAnioFIRE')} value={resumen.anioFIRE ?? '—'} valueColor="var(--accent)" />
      <KpiBox label={t(lang,'fireTasaReal')} value={`${resumen.tasaPromedio}%`} />

      <hr style={{ borderColor: 'var(--border)', margin: '4px 0' }} />

      {/* Config */}
      <div className="label">{t(lang, 'fireConfigTitle')}</div>

      <div className="flex flex-col gap-2.5">
        {inp(t(lang,'fireMetaUSD'),           'fire_meta_usd',           'number', '500000')}
        {inp(t(lang,'fireMetaEdad'),          'fire_meta_edad',          'number', '45')}
        {inp(t(lang,'fireAumentoAporte'),     'fire_aumento_aporte',     'number', '1.20')}
        {inp(t(lang,'fireRentabilidad'),      'fire_rentabilidad_anual', 'number', '6.00')}
        {inp(t(lang,'fireFechaNac'),          'fire_fecha_nacimiento',   'date')}
        {inp(t(lang,'fireAporteInicial'),     'fire_aporte_inicial',     'number', '0')}
        {inp(t(lang,'fireSaldoInicial'),      'fire_saldo_inicial',      'number', '0')}
        {inp(t(lang,'fireInicioMes'),         'fire_inicio_mes',         'month')}
      </div>

      <button
        onClick={handleSave}
        disabled={saveState === 'saving'}
        className="w-full py-2 rounded-xl text-[12.5px] font-semibold mt-1"
        style={{
          background: saveState === 'ok'  ? 'var(--success, #22c55e)'
                    : saveState === 'err' ? '#ef4444'
                    : 'var(--cta-bg)',
          color: 'var(--cta-text)',
          border: 'none',
          cursor: saveState === 'saving' ? 'wait' : 'pointer',
          opacity: saveState === 'saving' ? 0.7 : 1,
          transition: 'background 0.2s',
        }}
      >
        {saveState === 'saving' ? 'Guardando…'
         : saveState === 'ok'  ? 'Guardado ✓'
         : saveState === 'err' ? 'Error al guardar'
         : t(lang, 'fireGuardarConfig')}
      </button>
    </div>
  )
}
