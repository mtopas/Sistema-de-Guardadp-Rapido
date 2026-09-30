import { useEffect, useMemo, useState } from 'react'
import { FileText, Image as ImageIcon, Link2, Loader2, Sparkles, Type, Upload } from 'lucide-react'
import { Button, ColorPicker, Field, Input, Modal, Select, Textarea, cx } from '../../ui/primitives'
import { RichEditor } from '../../ui/RichEditor'
import { detectTipo, rutaCategoria, useBoveda } from '../../store/boveda'
import { assetUrl } from '../../lib/api'
import { toast } from '../../store/ui'

const TIPOS = [
  { id: 'texto', label: 'Texto', icon: Type, hint: 'Una idea, una cita, una nota' },
  { id: 'link', label: 'Enlace', icon: Link2, hint: 'Una URL con vista previa' },
  { id: 'foto', label: 'Foto', icon: ImageIcon, hint: 'Una imagen subida al vault' },
]

/** Captura rápida: Ctrl+Enter guarda. El tipo se autodetecta como en detectType.js. */
export function CaptureModal() {
  const captura = useBoveda((s) => s.captura)
  const close = useBoveda((s) => s.closeCaptura)
  const categorias = useBoveda((s) => s.categorias)
  const crearHoja = useBoveda((s) => s.crearHoja)
  const subirArchivo = useBoveda((s) => s.subirArchivo)
  const catFilter = useBoveda((s) => s.catFilter)

  const open = !!captura
  const [tipo, setTipo] = useState('texto')
  const [contenido, setContenido] = useState('')
  const [titulo, setTitulo] = useState('')
  const [apuntes, setApuntes] = useState('')
  const [catId, setCatId] = useState('')
  const [color, setColor] = useState('')
  const [busy, setBusy] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (!open) return
    setTipo(captura.tipo || 'texto')
    setContenido(captura.contenido || '')
    setTitulo(captura.titulo || '')
    setApuntes(captura.apuntes || '')
    setCatId(String(captura.categoria_id ?? catFilter ?? ''))
    setColor(captura.color || '')
    setBusy(false)
    setManual(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autodetección: si el usuario no eligió el tipo a mano, lo inferimos del texto.
  useEffect(() => {
    if (manual || !contenido) return
    const t = detectTipo(contenido)
    if (t !== tipo) setTipo(t)
  }, [contenido, manual]) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(
    () =>
      categorias
        .filter((c) => !/basura/i.test(c.nombre || c.ruta || ''))
        .map((c) => ({ value: c.id, label: rutaCategoria(categorias, c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [categorias],
  )

  const guardar = async () => {
    if (!contenido.trim() && tipo !== 'foto') { toast('Falta el contenido', 'warn'); return }
    setBusy(true)
    const body = {
      tipo,
      contenido: contenido.trim(),
      apuntes: apuntes || '',
    }
    if (titulo.trim()) body.titulo = titulo.trim()
    if (catId) body.categoria_id = Number(catId)
    if (color) body.color = color
    const r = await crearHoja(body)
    setBusy(false)
    if (r) close()
  }

  const onFile = async (file) => {
    if (!file) return
    setSubiendo(true)
    try {
      const url = await subirArchivo(file)
      if (url) {
        setTipo('foto')
        setManual(true)
        setContenido(url)
        setApuntes((a) => `<p><img src="${url}" alt="${file.name}" /></p>${a || ''}`)
        toast('Archivo subido')
      }
    } catch (e) {
      toast(e?.message || 'No se pudo subir el archivo', 'error')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Capturar en la Bóveda"
      sub="Ctrl+Enter para guardar sin salir del teclado"
      icon={Sparkles}
      width={660}
      footer={
        <>
          <span className="mr-auto text-[11px] text-txt-mute">
            {tipo === 'link' ? 'El backend genera la vista previa al guardar.' : 'El tipo se detecta solo.'}
          </span>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" icon={FileText} loading={busy} onClick={guardar}>Guardar</Button>
        </>
      }
    >
      <div
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); guardar() } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((t) => {
            const on = tipo === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTipo(t.id); setManual(true) }}
                className="surface flex flex-col items-start gap-1 p-2.5 text-left transition-all duration-200 ease-swift hover:-translate-y-0.5"
                style={{
                  boxShadow: on
                    ? 'inset 0 0 0 1.5px var(--accent), 0 10px 22px -14px color-mix(in srgb, var(--accent) 80%, transparent)'
                    : 'inset 0 0 0 1px var(--border)',
                }}
              >
                <t.icon size={15} style={{ color: on ? 'var(--accent)' : 'var(--subtext)' }} />
                <span className="text-[12.5px] font-medium">{t.label}</span>
                <span className="text-[10.5px] leading-tight text-txt-mute">{t.hint}</span>
              </button>
            )
          })}
        </div>

        <Field label={tipo === 'link' ? 'URL' : tipo === 'foto' ? 'Ruta del archivo' : 'Contenido'} required>
          {tipo === 'texto' ? (
            <Textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Pegá una idea, una cita, un pensamiento…"
              autoFocus
              rows={3}
            />
          ) : (
            <Input
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder={tipo === 'link' ? 'https://…' : '/uploads/…'}
              autoFocus
            />
          )}
        </Field>

        {tipo === 'foto' && (
          <div className="flex items-center gap-3">
            <label className="btn cursor-pointer">
              {subiendo ? <Loader2 size={14} className="a-spin" /> : <Upload size={14} />}
              Subir imagen
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <span className="text-[11px] text-txt-mute">o arrastrá el archivo acá</span>
            {contenido && (
              <img src={assetUrl(contenido)} alt="" className="ml-auto h-12 w-12 rounded-lg object-cover a-scale" />
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título (opcional)">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Se usa el contenido si lo dejás vacío" />
          </Field>
          <Field label="Categoría">
            <Select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              placeholder="Sin categoría"
              options={opciones}
            />
          </Field>
        </div>

        <Field label="Color de la hoja">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        <Field label="Apuntes" hint="Se guardan como HTML en el campo `apuntes`, igual que el editor del proyecto original.">
          <RichEditor value={apuntes} onChange={setApuntes} minHeight={130} />
        </Field>
      </div>
    </Modal>
  )
}
