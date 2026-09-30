import { useEffect, useState } from 'react'
import {
  Activity, CheckCircle2, Database, Download, Globe, Info, Keyboard, Palette, RefreshCw,
  Save, Server, Sparkles, XCircle,
} from 'lucide-react'
import {
  Button, Card, CardHead, Field, IconButton, Input, Kbd, Stat, Switch, cx,
} from '../../ui/primitives'
import { FONT_PAIRS, THEMES, TONES } from '../../lib/theme'
import { getApiBase, ping, setApiBase } from '../../lib/api'
import { useUI, toast } from '../../store/ui'
import { useBoveda } from '../../store/boveda'
import { useFin } from '../../store/fin'
import { useAgenda } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { downloadFile } from '../../lib/fin'
import { toISODate } from '../../lib/dates'

export default function AjustesScreen() {
  const prefs = useUI((s) => s.prefs)
  const setPref = useUI((s) => s.setPref)
  const reset = useUI((s) => s.resetPrefs)
  const online = useUI((s) => s.online)
  const latency = useUI((s) => s.latency)
  const setOnline = useUI((s) => s.setOnline)

  const boveda = useBoveda()
  const fin = useFin()
  const agenda = useAgenda()
  const habitos = useHabitos()

  const [base, setBase] = useState(getApiBase())
  const [probando, setProbando] = useState(false)

  useEffect(() => { setBase(getApiBase()) }, [])

  // Si se entra directo a /ajustes, los stores están vacíos y los contadores
  // dirían "0" sin que eso signifique nada: se cargan los que falten.
  useEffect(() => {
    if (!boveda.loaded) { boveda.fetchAll(); boveda.fetchRecientes() }
    if (!fin.loaded) fin.fetchAll()
    if (!agenda.loaded) agenda.fetchBase()
    if (!habitos.loaded) habitos.fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const probar = async () => {
    setProbando(true)
    try {
      const ms = await ping()
      setOnline(true, ms)
      toast(`La API respondió en ${ms} ms`)
    } catch (e) {
      setOnline(false, null)
      toast(e?.message || 'No se pudo alcanzar la API', 'error', 6000)
    } finally {
      setProbando(false)
    }
  }

  const guardarBase = () => {
    setApiBase(base.trim() || null)
    toast('Base de la API guardada — recargando…')
    setTimeout(() => window.location.reload(), 700)
  }

  const exportarTodo = () => {
    const dump = {
      generado: new Date().toISOString(),
      api: getApiBase(),
      boveda: { categorias: boveda.categorias, hojas: boveda.hojas },
      finanzas: {
        cuentas: fin.cuentas, categorias: fin.categorias, movimientos: fin.movs,
        config: fin.config, objetivos: fin.objetivos, instrumentos: fin.instrumentos,
        transacciones: fin.transacciones, fireFilas: fin.fireFilas, inflacion: fin.inflacion,
      },
      agenda: { calendarios: agenda.calendarios, eventos: agenda.eventos, listas: agenda.listas, tareas: agenda.tareas, horario: agenda.horario },
      habitos: { habitos: habitos.habitos, registros: habitos.registros },
    }
    downloadFile(`sgr-snapshot-${toISODate()}.json`, JSON.stringify(dump, null, 2), 'application/json')
    toast('Snapshot descargado (solo lo que está en memoria)')
  }

  const recargarTodo = async () => {
    await Promise.all([boveda.fetchAll(), fin.fetchAll(), agenda.fetchBase(), habitos.fetchAll()])
    boveda.fetchRecientes()
    toast('Datos recargados desde la API')
  }

  const ATAJOS = [
    ['Ctrl K', 'Paleta de comandos'],
    ['Ctrl M', 'Panel de apariencia'],
    ['Ctrl Enter', 'Capturar en la Bóveda / guardar en un modal'],
    ['1 – 5', 'Cambiar de módulo (con Alt)'],
    ['Esc', 'Cerrar modal o paleta'],
  ]

  return (
    <div className="scroll flex-1 px-4 pb-4">
      <div className="mx-auto max-w-[1080px] space-y-3">
        <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Hojas en la Bóveda" value={boveda.hojas.length} sub={`${boveda.categorias.length} categorías`} icon={Database} />
          <Stat label="Movimientos" value={fin.movs.length} sub={`${fin.cuentas.length} cuentas`} icon={Database} />
          <Stat label="Eventos + tareas" value={agenda.eventos.length + agenda.tareas.length} sub={`${agenda.calendarios.length} calendarios`} icon={Database} />
          <Stat label="Hábitos" value={habitos.habitos.length} sub={`${habitos.registros.length} registros`} icon={Database} />
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card spot>
            <CardHead
              title="Conexión con la API"
              sub="Este frontend no toca la base directamente: todo pasa por la API de SGR."
              icon={Server}
              right={
                <span
                  className="chip gap-1.5"
                  style={{
                    borderColor: `color-mix(in srgb, ${online ? 'var(--success)' : online === false ? 'var(--danger)' : 'var(--mute)'} 45%, transparent)`,
                    color: online ? 'var(--success)' : online === false ? 'var(--danger)' : 'var(--mute)',
                  }}
                >
                  {online ? <CheckCircle2 size={11} /> : online === false ? <XCircle size={11} /> : <Activity size={11} className="a-blink" />}
                  {online ? `${latency} ms` : online === false ? 'offline' : '…'}
                </span>
              }
            />
            <div className="space-y-3 px-3.5 pb-3.5">
              <Field
                label="Base de la API"
                hint="Vacío = proxy de Vite (/api → http://127.0.0.1:8765). Para el homelab por Tailscale: http://<ip-tailscale>:8765"
              >
                <div className="flex gap-2">
                  <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="/api" className="mono text-[12px]" />
                  <Button icon={Save} onClick={guardarBase}>Guardar</Button>
                </div>
              </Field>
              <div className="flex gap-2">
                <Button icon={Activity} loading={probando} onClick={probar} className="flex-1">Probar conexión</Button>
                <Button icon={RefreshCw} onClick={recargarTodo} className="flex-1">Recargar datos</Button>
              </div>
              <div className="surface px-3 py-2.5 text-[11.5px] leading-relaxed text-txt-sub">
                <b className="text-txt-2">Offline-first:</b> si la API no responde, los cambios quedan aplicados
                en pantalla y se avisa con un toast. No se pierden los datos ya cargados, pero lo nuevo
                no se guarda hasta que la API vuelva.
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Datos" sub="Snapshot local de lo que este frontend tiene en memoria" icon={Download} />
            <div className="space-y-3 px-3.5 pb-3.5">
              <Button icon={Download} onClick={exportarTodo} className="w-full">Descargar snapshot JSON</Button>
              <p className="text-[11.5px] leading-relaxed text-txt-sub">
                No reemplaza al backup real: la copia de la base la hacen el launcher y los scripts de
                sync (<code className="mono">/sync/export</code>). Esto sirve para inspeccionar o depurar.
              </p>
              <hr className="divider" />
              <Button icon={RefreshCw} variant="ghost" onClick={() => { localStorage.clear(); window.location.reload() }} className="w-full">
                Limpiar preferencias locales y recargar
              </Button>
            </div>
          </Card>
        </div>

        <Card>
          <CardHead
            title="Apariencia"
            sub="Todo se guarda en localStorage; los temas solo escriben variables CSS."
            icon={Palette}
            right={<Button size="sm" onClick={reset}>Restaurar</Button>}
          />
          <div className="space-y-5 px-3.5 pb-4">
            <div>
              <h4 className="label mb-2">Tema</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {Object.entries(THEMES).map(([id, t]) => {
                  const on = prefs.theme === id
                  return (
                    <button
                      key={id}
                      onClick={() => setPref('theme', id)}
                      className="surface flex flex-col gap-2 p-2.5 text-left transition-all duration-200 ease-swift hover:-translate-y-0.5"
                      style={{ boxShadow: on ? `inset 0 0 0 1.5px ${t.swatch[0]}, 0 12px 26px -16px ${t.swatch[0]}` : 'inset 0 0 0 1px var(--border)' }}
                    >
                      <div className="flex gap-1">
                        {t.swatch.map((c) => <span key={c} className="h-5 flex-1 rounded-[4px]" style={{ background: c }} />)}
                      </div>
                      <span className="text-[11.5px] font-medium">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <h4 className="label mb-2">Tono</h4>
                <div className="tabs">
                  {Object.entries(TONES).map(([id, t]) => (
                    <button key={id} className="tab flex-1" data-on={prefs.tone === id} onClick={() => setPref('tone', id)}>
                      {prefs.tone === id && <span className="tab-pill" />}
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="label mb-2">Tipografía</h4>
                <div className="tabs">
                  {Object.entries(FONT_PAIRS).map(([id, f]) => (
                    <button key={id} className="tab flex-1" data-on={prefs.font === id} onClick={() => setPref('font', id)}>
                      {prefs.font === id && <span className="tab-pill" />}
                      <span className="relative z-10">{f.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="label mb-2">Densidad</h4>
                <div className="tabs">
                  {[['compacta', 'Compacta'], ['normal', 'Normal'], ['amplia', 'Amplia']].map(([id, label]) => (
                    <button key={id} className="tab flex-1" data-on={prefs.density === id} onClick={() => setPref('density', id)}>
                      {prefs.density === id && <span className="tab-pill" />}
                      <span className="relative z-10">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Switch checked={prefs.arcoiris} onChange={(v) => setPref('arcoiris', v)} label="Acento por módulo" />
              <Switch checked={prefs.aurora} onChange={(v) => setPref('aurora', v)} label="Fondo aurora" />
              <Switch checked={prefs.motion} onChange={(v) => setPref('motion', v)} label="Transiciones suaves" />
              <Switch checked={prefs.railExpanded} onChange={(v) => setPref('railExpanded', v)} label="Menú expandido" />
            </div>
          </div>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <CardHead title="Atajos de teclado" icon={Keyboard} />
            <div className="space-y-2 px-3.5 pb-3.5">
              {ATAJOS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-line pb-1.5 text-[12.5px]">
                  <span className="text-txt-2">{v}</span>
                  <span className="flex shrink-0 gap-1">
                    {k.split(' ').map((p) => <Kbd key={p}>{p}</Kbd>)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Sobre este frontend" icon={Info} />
            <div className="space-y-2.5 px-3.5 pb-3.5 text-[12px] leading-relaxed text-txt-sub">
              <p>
                <b className="text-txt-2">Front-Claude-Design</b> es una interfaz alternativa y completa
                para SGR: Bóveda, Finanzas, Agenda y Hábitos sobre la misma API local en el puerto 8765.
              </p>
              <p>
                No comparte código con <code className="mono">project/frontend</code>: es un proyecto
                Vite independiente que habla solo por HTTP. Podés correr los dos en paralelo (este en
                <code className="mono"> :5273</code>) sin que se pisen.
              </p>
              <ul className="space-y-1 pt-1">
                <li>· React 18 · Vite · Zustand · Tailwind (tokens por CSS vars)</li>
                <li>· Gráficos SVG propios, sin librería de charts</li>
                <li>· Editor de apuntes propio sobre <code className="mono">contenteditable</code></li>
                <li>· Reglas de negocio de Finanzas replicadas en <code className="mono">src/lib/fin.js</code></li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
