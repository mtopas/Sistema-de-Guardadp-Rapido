import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, Link2, Image, ExternalLink, RefreshCw, Trash2, Maximize2, Save, CircleDot, MapPin, X } from 'lucide-react'
import { useBoveda, photoFromApuntes, hojaTitulo } from '../../store/boveda'
import { CategoriaSelect } from '../../app/CaptureModal'
import { Swatches, ConfirmButton, Field, Seg } from '../../components/ui'
import RichEditor from '../../components/RichEditor'
import { assetUrl } from '../../lib/api'
import { fmtDate, relativeTime } from '../../lib/dates'

export const TIPO_ICON = { texto: FileText, link: Link2, foto: Image }

export default function HojaDetail({ hoja, onClose, full = false }) {
  const editar = useBoveda((s) => s.editarHoja)
  const borrar = useBoveda((s) => s.borrarHoja)
  const refrescar = useBoveda((s) => s.refrescarPreview)
  const nav = useNavigate()
  const [titulo, setTitulo] = useState(hoja.contenido)
  const { src: photo, rest } = photoFromApuntes(hoja.apuntes)
  const [apuntes, setApuntes] = useState(rest)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)
  const titleRef = useRef(null)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [titulo, full])
  const Icon = TIPO_ICON[hoja.tipo] || FileText

  useEffect(() => {
    setTitulo(hoja.contenido)
    setApuntes(photoFromApuntes(hoja.apuntes).rest)
    setDirty(false)
  }, [hoja.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveApuntes = async (html) => {
    setSaving(true)
    const full = photo ? `<p><img src="${photo}"></p>${html}` : html
    const ok = await editar(hoja.id, { apuntes: full })
    setSaving(false)
    if (ok) setDirty(false)
  }

  const onApuntes = (html) => {
    setApuntes(html)
    setDirty(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveApuntes(html), 1400)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const saveTitulo = () => {
    if (titulo.trim() && titulo !== hoja.contenido) editar(hoja.id, { contenido: titulo.trim() })
  }

  const lp = hoja.link_preview
  const url = hoja.link_url || (hoja.tipo === 'link' ? hoja.contenido : null)
  const color = hoja.color || 'var(--a1)'

  return (
    <motion.div key={hoja.id} className="col" style={{ gap: 14 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <motion.span
          className="center"
          style={{ width: 42, height: 42, borderRadius: 14, background: `${hoja.color || '#9d4bff'}26`, color, boxShadow: `0 0 22px -6px ${hoja.color || 'var(--a1)'}`, flexShrink: 0, fontSize: 20 }}
          animate={{ rotate: [0, 6, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity }}
        >
          {hoja.icono || <Icon size={20} />}
        </motion.span>
        <div className="grow">
          <div className="tiny upper muted row gap6">
            {hoja.tipo} · {relativeTime(hoja.fecha)}
            {hoja._pending && <span className="chip" style={{ color: 'var(--amber)' }}>sin sincronizar</span>}
            {saving ? <span className="chip"><RefreshCw size={10} className="spin" /> guardando</span> : dirty ? <span className="chip" style={{ color: 'var(--amber)' }}><CircleDot size={10} /> sin guardar</span> : null}
          </div>
          <textarea
            className="display"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={saveTitulo}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur() } }}
            ref={titleRef}
            rows={1}
            style={{ width: '100%', background: 'transparent', border: 0, outline: 'none', resize: 'none', overflow: 'hidden', overflowWrap: 'anywhere', fontSize: full ? 24 : 17, fontWeight: 600, lineHeight: 1.3, padding: 0, marginTop: 2 }}
          />
        </div>
        {!full && <button className="iconbtn sm" title="Abrir en página completa" onClick={() => nav(`/hoja/${hoja.id}`)}><Maximize2 size={15} /></button>}
        {onClose && <button className="iconbtn sm" onClick={onClose}><X size={15} /></button>}
      </div>

      {hoja.tipo === 'link' && (
        <div className="glass neon-edge" style={{ borderRadius: 16, overflow: 'hidden' }}>
          {lp?.image && <img src={lp.image} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} onError={(e) => (e.target.style.display = 'none')} />}
          <div style={{ padding: 12 }}>
            <div className="row">
              {lp?.favicon && <img src={lp.favicon} alt="" width={16} height={16} style={{ borderRadius: 4 }} onError={(e) => (e.target.style.display = 'none')} />}
              <b className="grow ellipsis">{lp?.title || 'Sin vista previa'}</b>
            </div>
            {lp?.description && <div className="small muted" style={{ marginTop: 6 }}>{lp.description}</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <a className="btn sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a>
              <button className="btn sm ghost" onClick={() => refrescar(hoja.id)}><RefreshCw size={13} /> Vista previa</button>
              <span className="small dim ellipsis grow" title={url}>{url}</span>
            </div>
          </div>
        </div>
      )}

      {photo && (
        <motion.img
          src={assetUrl(photo)}
          alt={hoja.contenido}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ width: '100%', borderRadius: 18, boxShadow: `0 20px 50px -20px ${hoja.color || 'var(--a1)'}`, maxHeight: full ? 520 : 280, objectFit: 'contain', background: 'rgba(0,0,0,.3)' }}
        />
      )}

      {(hoja.lugar || hoja.latitud) && (
        <a className="chip" href={`https://www.openstreetmap.org/?mlat=${hoja.latitud}&mlon=${hoja.longitud}#map=16/${hoja.latitud}/${hoja.longitud}`} target="_blank" rel="noreferrer">
          <MapPin size={12} /> {hoja.lugar || `${hoja.latitud}, ${hoja.longitud}`}
        </a>
      )}

      <div className={full ? 'grid2' : 'col'}>
        <Field label="Categoría">
          <CategoriaSelect className="select sm" value={hoja.categoria_id} onChange={(v) => editar(hoja.id, { categoria_id: v })} />
        </Field>
        <Field label="Tipo">
          <Seg id={`tipo-${hoja.id}`} value={hoja.tipo} onChange={(v) => editar(hoja.id, { tipo: v })} options={[{ id: 'texto', label: 'Texto' }, { id: 'link', label: 'Link' }, { id: 'foto', label: 'Foto' }]} />
        </Field>
      </div>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <Field label="Color" className="grow">
          <Swatches value={hoja.color} onChange={(c) => editar(hoja.id, { color: c })} />
        </Field>
        <Field label="Icono">
          <input className="input sm" style={{ width: 64, textAlign: 'center', fontSize: 18 }} maxLength={4} defaultValue={hoja.icono || ''} onBlur={(e) => e.target.value !== (hoja.icono || '') && editar(hoja.id, { icono: e.target.value || null })} placeholder="✦" />
        </Field>
      </div>

      <div className="field">
        <div className="row">
          <label className="lbl grow">Apuntes</label>
          {dirty && <button className="btn xs" onClick={() => saveApuntes(apuntes)}><Save size={12} /> Guardar</button>}
        </div>
        <RichEditor value={apuntes} onChange={onApuntes} minHeight={full ? 360 : 180} />
      </div>

      <div className="row">
        <span className="tiny dim grow">Creada {fmtDate(hoja.fecha, { day: '2-digit', month: 'long', year: 'numeric' })}{hoja.fecha_actualizado && hoja.fecha_actualizado !== hoja.fecha ? ` · editada ${relativeTime(hoja.fecha_actualizado)}` : ''}</span>
        <ConfirmButton onConfirm={() => { borrar(hoja.id); onClose?.(); if (full) nav('/') }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>
      </div>
    </motion.div>
  )
}

