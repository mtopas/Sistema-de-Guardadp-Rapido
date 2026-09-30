import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sun, TrendingUp, History, Plus, Flame, Archive, ChevronLeft, ChevronRight, Pencil, Trash2, Trophy, AlertTriangle, Sparkles,
  Filter, StickyNote, Check as CheckIcon, Sprout, Target,
} from 'lucide-react'
import { useHabitos } from '../../store/habitos'
import { Panel, Tabs, Check, Empty, Loader, Modal, Seg, ConfirmButton, Kpi, AnimatedNumber } from '../../components/ui'
import { Ring, Sparkline } from '../../components/charts'
import {
  buildRegMap, regOf, isScheduled, calcStreak, calcMaxStreak, pctRange, dayPct, statusHoy, frecuenciaTexto,
} from '../../lib/habitos'
import { toISODate, addDays, daysInMonth, MESES, MESES_CORTO, DIAS_CORTO, DIAS_LUN, startOfWeek, sameDay, fmtDate, parseDate } from '../../lib/dates'

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: Sun },
  { id: 'progreso', label: 'Progreso', icon: TrendingUp },
  { id: 'historial', label: 'Historial', icon: History },
]

export function useRegMap() {
  const registros = useHabitos((s) => s.registros)
  return useMemo(() => buildRegMap(registros), [registros])
}

export default function HabitosScreen() {
  const { tab, setTab, loaded, openModal, selectedId, habitos, select } = useHabitos()
  const selected = habitos.find((h) => h.id === selectedId)
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 1200)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth <= 1200)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return (
    <div className="mod">
      <aside className="mod-col"><LeftPanel /></aside>
      <section className="mod-center">
        <div className="mod-bar">
          <Tabs id="habitos" value={tab} onChange={setTab} tabs={TABS} />
          <span className="grow" />
          <button className="btn primary sm" onClick={() => openModal(null)}><Plus size={15} /> Hábito</button>
        </div>
        {!loaded ? <div className="glass center" style={{ flex: 1 }}><Loader label="Cargando hábitos" /></div> : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="mod-scroll" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              {tab === 'hoy' && <GrillaMes />}
              {tab === 'progreso' && <Progreso />}
              {tab === 'historial' && <Historial />}
            </motion.div>
          </AnimatePresence>
        )}
      </section>
      <aside className="mod-col mod-right"><RightPanel /></aside>
      <Modal open={narrow && !!selected} onClose={() => select(null)} title={selected?.nombre} icon={Sprout}>
        {selected && <Detalle h={selected} />}
      </Modal>
    </div>
  )
}

function LeftPanel() {
  const { habitos, registrar, desmarcar, select, selectedId, openModal } = useHabitos()
  const map = useRegMap()
  const [soloPend, setSoloPend] = useState(false)
  const [archivados, setArchivados] = useState(false)
  const hoy = new Date()
  const iso = toISODate(hoy)
  const activos = habitos.filter((h) => h.activo !== false)
  const programados = activos.filter((h) => isScheduled(h, hoy))
  const hechos = programados.reduce((a, h) => a + Number(regOf(map, h.id, iso)?.valor || 0), 0)
  const pct = programados.length ? hechos / programados.length : 0
  const list = (archivados ? habitos.filter((h) => h.activo === false) : activos).filter((h) => !soloPend || statusHoy(h, map) === 'pendiente')

  return (
    <>
      <Panel title="Hoy" icon={Sun}>
        <div className="row" style={{ gap: 16 }}>
          <Ring value={pct} size={88} stroke={9}>
            <div style={{ textAlign: 'center' }}>
              <div className="display" style={{ fontWeight: 800, fontSize: 15 }}>{Math.round(pct * 100)}%</div>
            </div>
          </Ring>
          <div>
            <div className="display" style={{ fontSize: 22, fontWeight: 700 }}>{hechos % 1 ? hechos.toFixed(1) : hechos}<span className="dim">/{programados.length}</span></div>
            <div className="small muted">{pct >= 1 ? '¡Día completo! ✦' : pct > 0.5 ? 'Vas muy bien' : programados.length ? 'Arrancá con uno' : 'Nada programado hoy'}</div>
          </div>
        </div>
      </Panel>
      <Panel title={archivados ? 'Archivados' : 'Mis hábitos'} icon={Sprout} actions={
        <>
          <button className={`iconbtn sm ${soloPend ? 'on' : ''}`} title="Solo pendientes hoy" onClick={() => setSoloPend(!soloPend)} style={soloPend ? { color: 'var(--a1)' } : undefined}><Filter size={14} /></button>
          <button className="iconbtn sm" title="Archivados" onClick={() => setArchivados(!archivados)} style={archivados ? { color: 'var(--a1)' } : undefined}><Archive size={14} /></button>
        </>
      }>
        {habitos.length === 0 ? (
          <Empty icon={Sprout} title="Sin hábitos" action={<button className="btn primary sm" onClick={() => openModal(null)}><Plus size={14} /> Crear el primero</button>}>Los pequeños actos diarios construyen identidad.</Empty>
        ) : (
          <div className="list">
            {list.map((h, i) => {
              const st = statusHoy(h, map)
              const racha = calcStreak(h, map)
              return (
                <motion.div key={h.id} className={`li ${selectedId === h.id ? 'on' : ''}`} onClick={() => select(h.id)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  {st === 'libre' || h.activo === false ? (
                    <span className="center dim" style={{ width: 20 }}>–</span>
                  ) : (
                    <Check on={st === 'hecho'} half={st === 'parcial'} color={h.color} onClick={() => (st === 'pendiente' ? registrar(h.id, iso, 1) : desmarcar(h.id, iso))} />
                  )}
                  <span className="dot" style={{ background: h.color, color: h.color, width: 7, height: 7 }} />
                  <span className={`grow ellipsis small ${st === 'hecho' ? 'strike' : ''}`}>{h.nombre}</span>
                  {racha >= 3 && <span className="tiny mono row gap4" style={{ color: 'var(--orange)' }}><Flame size={11} />{racha}</span>}
                </motion.div>
              )
            })}
            {list.length === 0 && <div className="small dim">{archivados ? 'Sin hábitos archivados.' : 'Todo hecho por hoy ✦'}</div>}
          </div>
        )}
      </Panel>
    </>
  )
}

function GrillaMes() {
  const { habitos, registrar, desmarcar, select } = useHabitos()
  const map = useRegMap()
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [cell, setCell] = useState(null) // { h, iso }
  const [cursor, setCursor] = useState(null) // { r, c }
  const scroller = useRef(null)
  const activos = habitos.filter((h) => h.activo !== false)
  const n = daysInMonth(ref.getFullYear(), ref.getMonth())
  const days = Array.from({ length: n }, (_, i) => new Date(ref.getFullYear(), ref.getMonth(), i + 1))
  const today = new Date()
  const todayIdx = days.findIndex((d) => sameDay(d, today))

  useEffect(() => {
    if (todayIdx >= 0 && scroller.current) scroller.current.scrollTo({ left: Math.max(0, todayIdx * 36 - 300), behavior: 'smooth' })
  }, [ref]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cell) return
    const h = (e) => {
      if (!cursor || e.target.closest('input, textarea, select')) return
      const { r, c } = cursor
      if (e.key === 'ArrowRight') { e.preventDefault(); setCursor({ r, c: Math.min(n - 1, c + 1) }) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor({ r, c: Math.max(0, c - 1) }) }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor({ r: Math.min(activos.length - 1, r + 1), c }) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor({ r: Math.max(0, r - 1), c }) }
      const hab = activos[r]
      const d = days[c]
      if (!hab || !d || d > today || !isScheduled(hab, d)) return
      const iso = toISODate(d)
      if (e.key === '1') registrar(hab.id, iso, 1)
      if (e.key === '2') registrar(hab.id, iso, 0.5)
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') desmarcar(hab.id, iso)
      if (e.key === 'Enter') setCell({ h: hab, iso })
      if (e.key === 'Escape') setCursor(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cursor, cell, activos, days, n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activos.length) return <div className="glass"><Empty icon={Sprout} title="Todavía no hay hábitos activos">Creá uno con el botón “Hábito”.</Empty></div>

  return (
    <>
      <div className="row">
        <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
          <button className="iconbtn sm" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <span className="display" style={{ minWidth: 150, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{MESES[ref.getMonth()]} {ref.getFullYear()}</span>
          <button className="iconbtn sm" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          <button className="btn xs" onClick={() => setRef(new Date(today.getFullYear(), today.getMonth(), 1))}>Hoy</button>
        </div>
        <span className="grow" />
        <div className="row small muted gap16 hide-sm">
          <span className="row gap4"><span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--mint)' }} /> total</span>
          <span className="row gap4"><span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--amber)' }} /> parcial</span>
          <span className="row gap4"><span style={{ width: 12, height: 12, borderRadius: 4, border: '1px solid var(--line-strong)' }} /> pendiente</span>
          <span className="tiny"><kbd>←↑↓→</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>⌫</kbd></span>
        </div>
      </div>
      <div className="glass" style={{ borderRadius: 22, overflow: 'hidden' }}>
        <div ref={scroller} style={{ overflowX: 'auto' }} role="grid">
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--panel-solid)', minWidth: 190, textAlign: 'left', padding: '10px 14px' }} className="tiny upper muted">Hábito</th>
                {days.map((d, i) => (
                  <th key={i} style={{ padding: '6px 0', minWidth: 36, textAlign: 'center', background: i === todayIdx ? 'rgba(var(--a1-rgb), .15)' : undefined }}>
                    <div className="tiny dim">{DIAS_CORTO[d.getDay()][0]}</div>
                    <div className="mono small" style={{ fontWeight: 700, color: i === todayIdx ? 'var(--a1)' : undefined }}>{d.getDate()}</div>
                  </th>
                ))}
                <th style={{ position: 'sticky', right: 0, zIndex: 3, background: 'var(--panel-solid)', padding: '6px 12px' }} className="tiny upper muted">%</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((h, r) => {
                const pct = pctRange([h], map, days[0], days[n - 1])
                return (
                  <tr key={h.id} role="row">
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--panel-solid)', padding: '6px 14px', borderTop: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => select(h.id)}>
                      <div className="row gap6"><span className="dot" style={{ background: h.color, color: h.color }} /><span className="small ellipsis" style={{ maxWidth: 150, fontWeight: 600 }}>{h.nombre}</span></div>
                    </td>
                    {days.map((d, c) => {
                      const iso = toISODate(d)
                      const prog = isScheduled(h, d)
                      const fut = d > today && !sameDay(d, today)
                      const reg = regOf(map, h.id, iso)
                      const v = Number(reg?.valor || 0)
                      const isCur = cursor?.r === r && cursor?.c === c
                      return (
                        <td key={c} role="gridcell" style={{ padding: 3, borderTop: '1px solid var(--line)', background: c === todayIdx ? 'rgba(var(--a1-rgb), .08)' : undefined }}>
                          <motion.button
                            whileHover={prog && !fut ? { scale: 1.18 } : {}}
                            whileTap={prog && !fut ? { scale: 0.85 } : {}}
                            disabled={!prog || fut}
                            title={`${h.nombre} · ${fmtDate(iso)}${reg?.nota ? ` — ${reg.nota}` : ''}`}
                            onClick={() => { setCursor({ r, c }); setCell({ h, iso }) }}
                            className={v >= 1 ? 'habito-cell-pulse' : ''}
                            style={{
                              width: 30, height: 30, borderRadius: 9, border: 0, cursor: prog && !fut ? 'pointer' : 'default', display: 'grid', placeItems: 'center', position: 'relative',
                              background: !prog ? 'transparent' : v >= 1 ? h.color : v > 0 ? 'var(--amber)' : fut ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)',
                              boxShadow: v >= 1 ? `0 0 14px -2px ${h.color}` : isCur ? '0 0 0 2px var(--a2)' : v === 0 && prog && !fut ? 'inset 0 0 0 1px var(--line-strong)' : 'none',
                              outline: isCur ? '2px solid var(--a2)' : 'none', outlineOffset: 1,
                              color: '#05060f',
                            }}
                          >
                            {!prog ? <span className="dim" style={{ fontSize: 10 }}>·</span> : v >= 1 ? <CheckIcon size={15} strokeWidth={3} /> : v > 0 ? <span style={{ fontWeight: 800, fontSize: 11 }}>½</span> : null}
                            {reg?.nota && <span style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                          </motion.button>
                        </td>
                      )
                    })}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, background: 'var(--panel-solid)', padding: '6px 12px', borderTop: '1px solid var(--line)' }} className="mono small">
                      {pct == null ? '—' : `${Math.round(pct)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <CompletarModal cell={cell} onClose={() => setCell(null)} />
      <style>{`@keyframes habpulse { 0% { transform: scale(.6) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } } .habito-cell-pulse { animation: habpulse .4s ease-out; }`}</style>
    </>
  )
}

function CompletarModal({ cell, onClose }) {
  const { registrar, desmarcar } = useHabitos()
  const map = useRegMap()
  const [nota, setNota] = useState('')
  const reg = cell ? regOf(map, cell.h.id, cell.iso) : null
  useEffect(() => { setNota(reg?.nota || '') }, [cell]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cell) return <Modal open={false} />
  const go = async (valor) => {
    await registrar(cell.h.id, cell.iso, valor, nota.trim() || null)
    onClose()
  }
  return (
    <Modal open={!!cell} onClose={onClose} title={cell.h.nombre} icon={Sprout} onSubmit={() => go(1)}>
      <div className="small muted">{fmtDate(cell.iso, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="grid2">
        <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }} className="glass" onClick={() => go(1)} style={{ padding: 20, borderRadius: 18, cursor: 'pointer', border: `2px solid ${reg?.valor >= 1 ? cell.h.color : 'var(--line)'}`, boxShadow: `0 0 30px -14px ${cell.h.color}` }}>
          <div className="display" style={{ fontSize: 26, color: cell.h.color }}>✓</div>
          <b>Total</b>
          <div className="tiny dim">tecla 1</div>
        </motion.button>
        <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }} className="glass" onClick={() => go(0.5)} style={{ padding: 20, borderRadius: 18, cursor: 'pointer', border: `2px solid ${reg?.valor === 0.5 ? 'var(--amber)' : 'var(--line)'}` }}>
          <div className="display" style={{ fontSize: 26, color: 'var(--amber)' }}>½</div>
          <b>Parcial</b>
          <div className="tiny dim">tecla 2</div>
        </motion.button>
      </div>
      <input className="input" placeholder="Nota corta (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === '1' && !nota) { e.preventDefault(); go(1) } if (e.key === '2' && !nota) { e.preventDefault(); go(0.5) } }} />
      {reg && <button className="btn danger sm" onClick={async () => { await desmarcar(cell.h.id, cell.iso); onClose() }}><Trash2 size={13} /> Borrar registro</button>}
    </Modal>
  )
}

function Progreso() {
  const { habitos, select } = useHabitos()
  const map = useRegMap()
  const [cat, setCat] = useState('todas')
  const activos = habitos.filter((h) => h.activo !== false && (cat === 'todas' || h.categoria === cat))
  const cats = [...new Set(habitos.map((h) => h.categoria).filter(Boolean))]
  const today = new Date()
  const semana = pctRange(activos, map, addDays(today, -6), today)
  const semanaPrev = pctRange(activos, map, addDays(today, -13), addDays(today, -7))
  const mes = pctRange(activos, map, new Date(today.getFullYear(), today.getMonth(), 1), today)
  const meses6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1)
    return { label: MESES_CORTO[d.getMonth()], v: pctRange(activos, map, d, new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
  })
  const trend = semana != null && semanaPrev != null ? semana - semanaPrev : null
  const momentum = trend == null ? 'Registrá unos días más para ver tu tendencia.' : trend > 5 ? `Momentum en alza: +${trend.toFixed(0)} pts vs la semana pasada. Seguí así 🚀` : trend < -5 ? `Semana más floja (${trend.toFixed(0)} pts). Volvé a lo mínimo: una sola casilla hoy.` : 'Ritmo estable. La consistencia es la que construye identidad.'
  const stats = activos.map((h) => ({
    h,
    racha: calcStreak(h, map),
    max: calcMaxStreak(h, map),
    mes: pctRange([h], map, new Date(today.getFullYear(), today.getMonth(), 1), today),
    prev: pctRange([h], map, new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)),
    d30: pctRange([h], map, addDays(today, -29), today),
  }))
  const mejor = [...stats].filter((s) => s.d30 != null).sort((a, b) => b.d30 - a.d30)[0]
  const peor = [...stats].filter((s) => s.d30 != null).sort((a, b) => a.d30 - b.d30)[0]

  return (
    <>
      <div className="row wrap gap6">
        <button className={`chip click ${cat === 'todas' ? 'on' : ''}`} onClick={() => setCat('todas')}>Todas</button>
        {cats.map((c) => <button key={c} className={`chip click ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="kpis">
        <Kpi i={0} label="Últimos 7 días" value={semana == null ? '—' : <AnimatedNumber value={semana} format={(v) => `${Math.round(v)}%`} />} sub={trend != null ? `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(0)} pts` : ''} color="#b4ff39" icon={TrendingUp} />
        <Kpi i={1} label="Este mes" value={mes == null ? '—' : <AnimatedNumber value={mes} format={(v) => `${Math.round(v)}%`} />} color="#2effa8" icon={Target} />
        <Kpi i={2} label="Mejor racha activa" value={Math.max(0, ...stats.map((s) => s.racha))} sub="días" color="#ff6b2c" icon={Flame} />
        <Kpi i={3} label="Hábitos activos" value={activos.length} color="#00f0ff" icon={Sprout} />
      </div>
      <motion.div className="glass card neon-edge lit row" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
        <Sparkles size={20} style={{ color: 'var(--a1)', flexShrink: 0 }} />
        <span>{momentum}</span>
      </motion.div>
      <Panel title="Mapa de calor · 3 meses" icon={Sun}>
        <Heatmap habitos={activos} map={map} />
      </Panel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <Panel title="Tendencia 6 meses" icon={TrendingUp}>
          <Sparkline values={meses6.map((m) => m.v)} height={90} color="var(--a1)" dots />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            {meses6.map((m) => <div key={m.label} className="tiny dim" style={{ textAlign: 'center' }}>{m.label}<div className="mono" style={{ color: 'var(--text)' }}>{m.v == null ? '—' : `${Math.round(m.v)}%`}</div></div>)}
          </div>
        </Panel>
        <Panel title="Destacados · 30 días" icon={Trophy}>
          {mejor && <div className="li" onClick={() => select(mejor.h.id)}><Trophy size={16} style={{ color: 'var(--amber)' }} /><div className="grow"><div className="tiny upper dim">Más consistente</div><b>{mejor.h.nombre}</b></div><span className="mono pos">{Math.round(mejor.d30)}%</span></div>}
          {peor && peor !== mejor && <div className="li" onClick={() => select(peor.h.id)}><AlertTriangle size={16} style={{ color: 'var(--red)' }} /><div className="grow"><div className="tiny upper dim">Necesita atención</div><b>{peor.h.nombre}</b></div><span className="mono neg">{Math.round(peor.d30)}%</span></div>}
          {!mejor && <div className="small dim">Sin datos suficientes.</div>}
        </Panel>
      </div>
      <Panel title="Todos los hábitos" icon={Filter}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Hábito</th><th className="num">Racha</th><th className="num">Máx.</th><th className="num">% mes</th><th className="num">Tendencia</th><th>30 días</th></tr></thead>
            <tbody>
              {stats.map((s) => {
                const tr = s.mes != null && s.prev != null ? s.mes - s.prev : null
                const serie = Array.from({ length: 30 }, (_, i) => { const d = addDays(today, -29 + i); return isScheduled(s.h, d) ? Number(regOf(map, s.h.id, toISODate(d))?.valor || 0) : null })
                return (
                  <tr key={s.h.id} onClick={() => select(s.h.id)} style={{ cursor: 'pointer' }}>
                    <td><div className="row gap6"><span className="dot" style={{ background: s.h.color, color: s.h.color }} />{s.h.nombre}</div></td>
                    <td className="num">{s.racha >= 3 ? '🔥 ' : ''}{s.racha}</td>
                    <td className="num">{s.max}</td>
                    <td className="num">{s.mes == null ? '—' : `${Math.round(s.mes)}%`}</td>
                    <td className="num" style={{ color: tr == null ? 'var(--dim)' : tr >= 0 ? 'var(--mint)' : 'var(--red)' }}>{tr == null ? '—' : `${tr >= 0 ? '▲' : '▼'} ${Math.abs(tr).toFixed(0)}`}</td>
                    <td style={{ width: 130 }}><Sparkline values={serie} height={26} width={120} color={s.h.color} fill={false} strokeWidth={1.6} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

function heatColor(v) {
  if (v == null) return 'rgba(255,255,255,.03)'
  if (v === 0) return 'rgba(255,77,109,.18)'
  const a = 0.25 + v * 0.75
  return `rgba(180, 255, 57, ${a.toFixed(2)})`
}

function Heatmap({ habitos, map }) {
  const setTab = useHabitos((s) => s.setTab)
  const today = new Date()
  const start = startOfWeek(addDays(today, -90))
  const weeks = []
  for (let d = new Date(start); d <= today; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="row" style={{ gap: 4, alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4, marginTop: 18 }}>{DIAS_LUN.map((d, i) => <div key={d} className="tiny dim" style={{ height: 16, lineHeight: '16px' }}>{i % 2 === 0 ? d : ''}</div>)}</div>
        {weeks.map((w, wi) => (
          <div key={wi} className="col" style={{ gap: 4 }}>
            <div className="tiny dim" style={{ height: 14 }}>{w[0].getDate() <= 7 ? MESES_CORTO[w[0].getMonth()] : ''}</div>
            {w.map((d) => {
              const fut = d > today
              const v = fut ? null : dayPct(habitos, map, d)
              return (
                <motion.div
                  key={toISODate(d)}
                  title={`${fmtDate(toISODate(d))}: ${v == null ? 'sin programar' : Math.round(v * 100) + '%'}`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: fut ? 0.2 : 1, scale: 1 }}
                  transition={{ delay: wi * 0.02 }}
                  whileHover={{ scale: 1.35 }}
                  onClick={() => setTab('historial')}
                  style={{ width: 16, height: 16, borderRadius: 4, background: heatColor(v), boxShadow: v >= 1 ? '0 0 8px rgba(180,255,57,.7)' : 'none', cursor: 'pointer', outline: sameDay(d, today) ? '1px solid #fff' : 'none' }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function Historial() {
  const { habitos } = useHabitos()
  const map = useRegMap()
  const [periodo, setPeriodo] = useState('mes')
  const [filtro, setFiltro] = useState('todos')
  const [ref, setRef] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [dia, setDia] = useState(null)
  const hs = habitos.filter((h) => (filtro === 'todos' ? h.activo !== false : h.id === Number(filtro)))
  const nMeses = periodo === 'mes' ? 1 : periodo === 'trimestre' ? 3 : 12
  const meses = Array.from({ length: nMeses }, (_, i) => new Date(ref.getFullYear(), ref.getMonth() - (nMeses - 1) + i, 1))
  return (
    <>
      <div className="row wrap">
        <Seg id="hist-per" value={periodo} onChange={setPeriodo} options={[{ id: 'mes', label: 'Mes' }, { id: 'trimestre', label: 'Trimestre' }, { id: 'anio', label: 'Año' }]} />
        <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
          <button className="iconbtn sm" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - nMeses, 1))}><ChevronLeft size={16} /></button>
          <span className="display" style={{ minWidth: 130, textAlign: 'center', fontSize: 12.5, fontWeight: 600 }}>{MESES_CORTO[meses[0].getMonth()]}{nMeses > 1 ? ` – ${MESES_CORTO[ref.getMonth()]}` : ''} {ref.getFullYear()}</span>
          <button className="iconbtn sm" onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + nMeses, 1))}><ChevronRight size={16} /></button>
        </div>
        <span className="grow" />
        <select className="select sm" style={{ width: 200 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos los hábitos</option>
          {habitos.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: nMeses === 1 ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {meses.map((m) => <MesCal key={toISODate(m)} ref0={m} hs={hs} map={map} big={nMeses === 1} onDay={setDia} />)}
      </div>
      <DiaModal iso={dia} onClose={() => setDia(null)} />
    </>
  )
}

function MesCal({ ref0, hs, map, big, onDay }) {
  const start = startOfWeek(ref0)
  const last = new Date(ref0.getFullYear(), ref0.getMonth() + 1, 0)
  const weeks = Math.ceil((((ref0.getDay() + 6) % 7) + last.getDate()) / 7)
  const today = new Date()
  const size = big ? 64 : 30
  return (
    <motion.div className="glass card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="display" style={{ fontWeight: 600, marginBottom: 8, fontSize: big ? 15 : 12.5 }}>{MESES[ref0.getMonth()]} {ref0.getFullYear()}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: big ? 6 : 3 }}>
        {DIAS_LUN.map((d) => <div key={d} className="tiny dim" style={{ textAlign: 'center' }}>{big ? d : d[0]}</div>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = addDays(start, i)
          const inM = d.getMonth() === ref0.getMonth()
          const fut = d > today
          const v = !inM || fut ? null : dayPct(hs, map, d)
          const notas = inM ? hs.map((h) => ({ h, r: regOf(map, h.id, toISODate(d)) })).filter((x) => x.r?.nota) : []
          const roto = inM && !fut && hs.length === 1 && isScheduled(hs[0], d) && !regOf(map, hs[0].id, toISODate(d)) && !sameDay(d, today)
          return (
            <motion.div
              key={i}
              whileHover={inM ? { scale: 1.08, zIndex: 2 } : {}}
              onClick={() => inM && !fut && onDay(toISODate(d))}
              title={notas.map((x) => `${x.h.nombre}: ${x.r.nota}`).join('\n') || undefined}
              style={{
                height: big ? size : size - 4, borderRadius: big ? 12 : 7, position: 'relative', cursor: inM && !fut ? 'pointer' : 'default',
                background: inM ? heatColor(v) : 'transparent', opacity: inM ? 1 : 0.15, padding: big ? 6 : 0,
                display: 'flex', alignItems: big ? 'flex-start' : 'center', justifyContent: big ? 'space-between' : 'center',
                outline: sameDay(d, today) ? '2px solid var(--a2)' : 'none', color: v > 0.6 ? '#05060f' : 'var(--text)',
              }}
            >
              <span className="mono" style={{ fontSize: big ? 12 : 9.5, fontWeight: 700 }}>{d.getDate()}</span>
              {big && v != null && <span className="tiny mono" style={{ fontWeight: 700 }}>{Math.round(v * 100)}%</span>}
              {notas.length > 0 && <StickyNote size={big ? 12 : 8} style={{ position: 'absolute', bottom: big ? 6 : 1, right: big ? 6 : 1 }} />}
              {roto && <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: big ? 12 : 8 }}>⚡</span>}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

function DiaModal({ iso, onClose }) {
  const { habitos, registrar, desmarcar } = useHabitos()
  const map = useRegMap()
  if (!iso) return <Modal open={false} />
  const d = parseDate(iso)
  const list = habitos.filter((h) => isScheduled(h, d))
  return (
    <Modal open={!!iso} onClose={onClose} title={fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })} icon={History}>
      {list.length === 0 && <div className="small dim">Ningún hábito programado ese día.</div>}
      <div className="list">
        {list.map((h) => {
          const r = regOf(map, h.id, iso)
          return (
            <div key={h.id} className="li" style={{ cursor: 'default' }}>
              <Check on={r?.valor >= 1} half={r?.valor === 0.5} color={h.color} onClick={() => (r ? desmarcar(h.id, iso) : registrar(h.id, iso, 1))} />
              <div className="grow"><div className="small" style={{ fontWeight: 600 }}>{h.nombre}</div>{r?.nota && <div className="tiny muted">“{r.nota}”</div>}</div>
              <button className="btn xs" onClick={() => registrar(h.id, iso, 0.5)}>½</button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function RightPanel() {
  const { habitos, selectedId } = useHabitos()
  const h = habitos.find((x) => x.id === selectedId)
  if (!h) {
    return (
      <Panel title="Detalle" icon={Sprout}>
        <Empty icon={Target} title="Elegí un hábito">Seleccioná uno de la lista o la grilla para ver su racha, notas y evolución.</Empty>
      </Panel>
    )
  }
  return <motion.div key={h.id} className="glass card neon-edge lit" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><Detalle h={h} /></motion.div>
}

function Detalle({ h }) {
  const { openModal, borrar, stats, registros } = useHabitos()
  const map = useRegMap()
  const [remote, setRemote] = useState(null)
  useEffect(() => {
    let alive = true
    if (h.id > 0) stats(h.id).then((s) => alive && setRemote(s)).catch(() => {})
    return () => { alive = false }
  }, [h.id, registros.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date()
  const racha = remote?.racha_actual ?? calcStreak(h, map)
  const max = remote?.racha_max ?? calcMaxStreak(h, map)
  const pctMes = remote?.pct_mes ?? Math.round(pctRange([h], map, new Date(today.getFullYear(), today.getMonth(), 1), today) || 0)
  const serie = Array.from({ length: 30 }, (_, i) => { const d = addDays(today, -29 + i); return isScheduled(h, d) ? Number(regOf(map, h.id, toISODate(d))?.valor || 0) : null })
  const recientes = registros.filter((r) => r.habito_id === h.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8)
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="center" style={{ width: 44, height: 44, borderRadius: 14, background: `${h.color}26`, color: h.color, boxShadow: `0 0 24px -6px ${h.color}`, flexShrink: 0 }}><Sprout size={20} /></span>
        <div className="grow">
          <div className="display" style={{ fontWeight: 600, fontSize: 17 }}>{h.nombre}</div>
          <div className="small muted">{frecuenciaTexto(h)}{h.hora ? ` · ${h.hora}` : ''}{h.categoria ? ` · ${h.categoria}` : ''}</div>
        </div>
      </div>
      {h.descripcion && <div className="small" style={{ fontStyle: 'italic', color: 'var(--muted)' }}>“{h.descripcion}”</div>}
      <div className="grid3" style={{ textAlign: 'center' }}>
        <div><div className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange)' }}>{racha}</div><div className="tiny dim">racha</div></div>
        <div><div className="display" style={{ fontSize: 24, fontWeight: 800 }}>{max}</div><div className="tiny dim">máxima</div></div>
        <div><div className="display" style={{ fontSize: 24, fontWeight: 800, color: h.color }}>{pctMes}%</div><div className="tiny dim">mes</div></div>
      </div>
      <div>
        <div className="tiny upper dim">Últimos 30 días</div>
        <Sparkline values={serie} height={60} color={h.color} />
      </div>
      <div>
        <div className="tiny upper dim" style={{ marginBottom: 6 }}>Registros recientes</div>
        <div className="list">
          {recientes.map((r) => (
            <div key={r.id} className="li small" style={{ cursor: 'default' }}>
              <span style={{ color: r.valor >= 1 ? h.color : 'var(--amber)' }}>{r.valor >= 1 ? '●' : '◐'}</span>
              <span className="mono tiny" style={{ width: 60 }}>{fmtDate(r.fecha)}</span>
              <span className="grow ellipsis muted">{r.nota || ''}</span>
            </div>
          ))}
          {recientes.length === 0 && <div className="small dim">Sin registros todavía.</div>}
        </div>
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => openModal(h)}><Pencil size={13} /> Editar</button>
        <span className="grow" />
        <ConfirmButton onConfirm={() => borrar(h.id)} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>
      </div>
    </div>
  )
}
