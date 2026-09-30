import { createPortal } from 'react-dom'
import { Palette, RotateCcw, Sparkles, Type, X, Zap } from 'lucide-react'
import { FONT_PAIRS, THEMES, TONES } from '../lib/theme'
import { Switch, cx } from '../ui/primitives'
import { useUI } from '../store/ui'

/** Ctrl+M — temas, tono, tipografía, densidad y efectos. */
export function TweaksPanel() {
  const open = useUI((s) => s.tweaks)
  const toggle = useUI((s) => s.toggleTweaks)
  const prefs = useUI((s) => s.prefs)
  const setPref = useUI((s) => s.setPref)
  const reset = useUI((s) => s.resetPrefs)
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80]" onMouseDown={(e) => { if (e.target === e.currentTarget) toggle(false) }}>
      <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, #05040a 40%, transparent)', backdropFilter: 'blur(3px)' }} />
      <aside
        className="panel absolute right-3 top-3 bottom-3 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden a-right"
        style={{ boxShadow: '0 40px 90px -30px #000' }}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Sparkles size={15} style={{ color: 'var(--accent)' }} /> Apariencia
          </h2>
          <div className="flex items-center gap-1">
            <button className="icon-btn" onClick={reset} title="Volver al tema por defecto"><RotateCcw size={14} /></button>
            <button className="icon-btn" onClick={() => toggle(false)} aria-label="Cerrar"><X size={15} /></button>
          </div>
        </header>

        <div className="scroll flex-1 space-y-5 px-4 py-4">
          <section>
            <h3 className="label mb-2 flex items-center gap-1.5"><Palette size={11} /> Tema</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(THEMES).map(([id, t]) => {
                const on = prefs.theme === id
                return (
                  <button
                    key={id}
                    onClick={() => setPref('theme', id)}
                    className={cx('surface flex flex-col gap-2 p-2.5 text-left transition-all duration-200 ease-swift hover:-translate-y-0.5')}
                    style={{
                      boxShadow: on ? `inset 0 0 0 1.5px ${t.swatch[0]}, 0 10px 24px -14px ${t.swatch[0]}` : 'inset 0 0 0 1px var(--border)',
                    }}
                  >
                    <div className="flex gap-1">
                      {t.swatch.map((c) => (
                        <span key={c} className="h-4 flex-1 rounded-[4px]" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="text-[11.5px] font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="label mb-2">Tono del fondo</h3>
            <div className="tabs">
              {Object.entries(TONES).map(([id, t]) => (
                <button key={id} className="tab flex-1" data-on={prefs.tone === id} onClick={() => setPref('tone', id)}>
                  {prefs.tone === id && <span className="tab-pill" />}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="label mb-2 flex items-center gap-1.5"><Type size={11} /> Tipografía</h3>
            <div className="space-y-1.5">
              {Object.entries(FONT_PAIRS).map(([id, f]) => (
                <button
                  key={id}
                  onClick={() => setPref('font', id)}
                  className="surface flex w-full items-center justify-between px-3 py-2 text-left transition-all duration-200 hover:-translate-y-px"
                  style={{ boxShadow: prefs.font === id ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--border)', fontFamily: f.sans }}
                >
                  <span className="text-[12.5px]">{f.label}</span>
                  <span className="text-[11px] text-txt-mute">Aa</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="label mb-2">Densidad</h3>
            <div className="tabs">
              {[['compacta', 'Compacta'], ['normal', 'Normal'], ['amplia', 'Amplia']].map(([id, label]) => (
                <button key={id} className="tab flex-1" data-on={prefs.density === id} onClick={() => setPref('density', id)}>
                  {prefs.density === id && <span className="tab-pill" />}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="label flex items-center gap-1.5"><Zap size={11} /> Efectos</h3>
            <Switch checked={prefs.arcoiris} onChange={(v) => setPref('arcoiris', v)} label="Acento por módulo (arcoíris)" />
            <Switch checked={prefs.aurora} onChange={(v) => setPref('aurora', v)} label="Fondo aurora animado" />
            <Switch checked={prefs.motion} onChange={(v) => setPref('motion', v)} label="Transiciones suaves" />
            <p className="text-[11px] leading-relaxed text-txt-mute">
              El acento por módulo pinta la interfaz de violeta en Bóveda, ámbar en Finanzas, azul en Agenda y verde en Hábitos.
            </p>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
