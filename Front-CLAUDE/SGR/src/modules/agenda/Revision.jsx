import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle, CalendarDays, Clock, Download, FileText, Printer, Wallet, TrendingUp } from 'lucide-react'
import { useAgenda, weekRange } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { useFin } from '../../store/fin'
import { Panel, Kpi, Loader } from '../../components/ui'
import { Bars, Ring } from '../../components/charts'
import { apiUrl } from '../../lib/api'
import { toISODate, addDays, fmtDate, DIAS_LUN, parseDate } from '../../lib/dates'
import { isScheduled } from '../../lib/habitos'
import { dolarDe, fmtARS, isTransferencia, toARS } from '../../lib/fin'

const useRev = create((set) => ({ ref: toISODate(), set: (ref) => set({ ref }) }))
const DESPIERTO = 16 * 60 * 7

function useSemana(refISO) {
  const revision = useAgenda((s) => s.revision)
  const tareas = useAgenda((s) => s.tareas)
  const habitos = useHabitos((s) => s.habitos)
  const [a, b] = weekRange(parseDate(refISO))
  const desde = toISODate(a)
  const hasta = toISODate(b)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    setData(null)
    setErr(false)
    revision(desde, hasta).then((r) => alive && setData(r)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [desde, hasta, revision])
  const local = useMemo(() => {
    const semana = tareas.filter((t) => t.fecha_opcional && t.fecha_opcional >= desde && t.fecha_opcional <= hasta)
    const porDia = Array.from({ length: 7 }, (_, i) => {
      const iso = toISODate(addDays(a, i))
      return { label: DIAS_LUN[i], full: fmtDate(iso, { weekday: 'long', day: 'numeric' }), hechas: semana.filter((t) => t.completada && t.fecha_opcional === iso).length, pendientes: semana.filter((t) => !t.completada && t.fecha_opcional === iso).length }
    })
    const bloques = semana.filter((t) => t.hora_bloque).reduce((acc, t) => acc + (Number(t.duracion_estimada) || 30), 0)
    let habMin = 0
    for (let i = 0; i < 7; i++) for (const h of habitos) if (h.hora && isScheduled(h, addDays(a, i))) habMin += 30
    return { semana, porDia, bloques, habMin }
  }, [tareas, habitos, desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps
  const minEventos = data ? (data.por_calendario || []).reduce((acc, c) => acc + (c.minutos || 0), 0) : 0
  const planificado = data ? Math.min(1, (minEventos + local.bloques + local.habMin) / DESPIERTO) : null
  return { desde, hasta, a, b, data, err, ...local, minEventos, planificado }
}

export default function RevisionView() {
  const ref = useRev((s) => s.ref)
  const setRef = useRev((s) => s.set)
  const w = useSemana(ref)
  const prev = useSemana(toISODate(addDays(parseDate(ref), -7)))
  const maxCal = Math.max(1, ...(w.data?.por_calendario || []).map((c) => c.minutos))

  const exportMd = () => {
    const lines = [
      `# Revisión semanal ${w.desde} → ${w.hasta}`,
      '',
      `- Completadas: ${w.data?.completadas ?? '?'}`,
      `- Incompletas: ${w.data?.incompletas ?? '?'}`,
      `- Vencidas (+7 días): ${w.data?.vencidas ?? '?'}`,
      `- Eventos: ${w.data?.total_eventos ?? '?'}`,
      `- Tiempo planificado: ${w.planificado != null ? Math.round(w.planificado * 100) + '%' : '?'}`,
      '',
      '## Tiempo por calendario',
      ...(w.data?.por_calendario || []).map((c) => `- ${c.nombre}: ${(c.minutos / 60).toFixed(1)} h`),
      '',
      '## Tareas completadas',
      ...w.semana.filter((t) => t.completada).map((t) => `- [x] ${t.titulo} (${t.fecha_opcional})`),
      '',
      '## Pendientes',
      ...w.semana.filter((t) => !t.completada).map((t) => `- [ ] ${t.titulo} (${t.fecha_opcional})`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const el = document.createElement('a')
    el.href = URL.createObjectURL(blob)
    el.download = `revision-${w.desde}.md`
    el.click()
  }

  const delta = (x, y) => (x != null && y != null ? x - y : null)
  const dC = delta(w.data?.completadas, prev.data?.completadas)

  return (
    <div className="mod-scroll" style={{ padding: 0 }}>
      <div className="row wrap">
        <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
          <button className="iconbtn sm" onClick={() => setRef(toISODate(addDays(parseDate(ref), -7)))}><ChevronLeft size={16} /></button>
          <span className="display" style={{ minWidth: 190, textAlign: 'center', fontSize: 12.5, fontWeight: 600 }}>{fmtDate(w.desde)} – {fmtDate(w.hasta)}</span>
          <button className="iconbtn sm" onClick={() => setRef(toISODate(addDays(parseDate(ref), 7)))}><ChevronRight size={16} /></button>
          <button className="btn xs" onClick={() => setRef(toISODate())}>Esta semana</button>
        </div>
        <span className="grow" />
        <button className="btn sm" onClick={exportMd}><FileText size={14} /> Markdown</button>
        <a className="btn sm" href={apiUrl('/agenda/export.ics', { desde: w.desde, hasta: w.hasta })} download><Download size={14} /> .ics</a>
        <button className="btn sm" onClick={() => window.print()}><Printer size={14} /> PDF</button>
      </div>
      {!w.data && !w.err ? <div className="glass"><Loader label="Analizando semana" /></div> : w.err ? (
        <div className="glass card small" style={{ color: 'var(--amber)' }}><AlertTriangle size={14} /> No se pudo cargar el resumen de la semana (¿API offline?).</div>
      ) : (
        <>
          <div className="kpis">
            <Kpi i={0} label="Completadas" value={w.data.completadas} sub={dC != null ? `${dC >= 0 ? '▲' : '▼'} ${Math.abs(dC)} vs semana anterior` : ''} color="#2effa8" icon={CheckCircle2} />
            <Kpi i={1} label="Incompletas" value={w.data.incompletas} color="#ffb800" icon={XCircle} />
            <Kpi i={2} label="Vencidas +7d" value={w.data.vencidas} color="#ff4d6d" icon={AlertTriangle} />
            <Kpi i={3} label="Eventos" value={w.data.total_eventos} color="#00c2ff" icon={CalendarDays} />
          </div>
          <Panel title="Tareas por día" icon={TrendingUp}>
            <Bars data={w.porDia} height={170} series={[{ key: 'hechas', label: 'Hechas', color: '#2effa8' }, { key: 'pendientes', label: 'Pendientes', color: '#ffb800' }]} />
          </Panel>
          <Panel title="Tiempo por calendario" icon={Clock}>
            {(w.data.por_calendario || []).length === 0 ? <div className="small dim">Sin eventos con horario esta semana.</div> : (
              <div className="col" style={{ gap: 10 }}>
                {w.data.por_calendario.map((c, i) => (
                  <div key={c.nombre}>
                    <div className="row small"><span className="dot" style={{ background: c.color, color: c.color }} /><span className="grow">{c.nombre}</span><b className="mono">{(c.minutos / 60).toFixed(1)} h</b></div>
                    <div className="bar" style={{ marginTop: 5 }}>
                      <motion.i initial={{ width: 0 }} animate={{ width: `${(c.minutos / maxCal) * 100}%` }} transition={{ delay: i * 0.08, duration: 0.9 }} style={{ background: c.color, boxShadow: `0 0 12px ${c.color}` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <Panel title="Hechas" icon={CheckCircle2}>
              <div className="list">
                {w.semana.filter((t) => t.completada).map((t) => <div key={t.id} className="li small" style={{ cursor: 'default' }}><CheckCircle2 size={13} style={{ color: 'var(--mint)' }} /><span className="grow ellipsis strike" style={{ opacity: 0.8 }}>{t.titulo}</span><span className="tiny dim">{fmtDate(t.fecha_opcional)}</span></div>)}
                {!w.semana.some((t) => t.completada) && <div className="small dim">Ninguna todavía.</div>}
              </div>
            </Panel>
            <Panel title="Quedaron pendientes" icon={XCircle}>
              <div className="list">
                {w.semana.filter((t) => !t.completada).map((t) => <div key={t.id} className="li small" style={{ cursor: 'default' }}><XCircle size={13} style={{ color: 'var(--amber)' }} /><span className="grow ellipsis">{t.titulo}</span><span className="tiny dim">{fmtDate(t.fecha_opcional)}</span></div>)}
                {!w.semana.some((t) => !t.completada) && <div className="small dim">Todo resuelto ✦</div>}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

export function RevisionRight() {
  const ref = useRev((s) => s.ref)
  const w = useSemana(ref)
  const { movs, config } = useFin()
  const dolar = dolarDe(config)
  const fin = useMemo(() => {
    let ing = 0, gas = 0
    for (const m of movs) {
      const d = (m.fecha || '').slice(0, 10)
      if (d < w.desde || d > w.hasta || isTransferencia(m) || (m.categoria_nombre || '').toLowerCase() === 'ajuste') continue
      if (m.tipo === 'income') ing += toARS(m, dolar)
      else if (m.tipo === 'expense') gas += toARS(m, dolar)
    }
    return { ing, gas }
  }, [movs, w.desde, w.hasta, dolar])
  return (
    <>
      <Panel title="Tiempo planificado" icon={Clock}>
        <div className="row" style={{ gap: 16 }}>
          <Ring value={w.planificado || 0} size={96} stroke={9}>
            <span className="display" style={{ fontWeight: 800 }}>{w.planificado != null ? Math.round(w.planificado * 100) : '–'}%</span>
          </Ring>
          <div className="small muted" style={{ lineHeight: 1.6 }}>
            Eventos {(w.minEventos / 60).toFixed(1)} h<br />
            Bloques {(w.bloques / 60).toFixed(1)} h<br />
            Hábitos {(w.habMin / 60).toFixed(1)} h<br />
            <span className="tiny dim">sobre 112 h despierto</span>
          </div>
        </div>
      </Panel>
      <Panel title="Finanzas · semana" icon={Wallet}>
        <div className="row small"><span className="grow muted">Ingresos</span><b className="mono pos">{fmtARS(fin.ing, { compact: true })}</b></div>
        <div className="row small"><span className="grow muted">Gastos</span><b className="mono neg">{fmtARS(fin.gas, { compact: true })}</b></div>
        <div className="hr" />
        <div className="row small"><b className="grow">Neto</b><b className={`mono ${fin.ing - fin.gas >= 0 ? 'pos' : 'neg'}`}>{fmtARS(fin.ing - fin.gas, { compact: true })}</b></div>
      </Panel>
    </>
  )
}
