import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { useBoveda } from '../../store/boveda'
import { get } from '../../lib/api'
import { Empty, Loader } from '../../components/ui'
import HojaDetail from './HojaDetail'

export default function HojaScreen() {
  const { id } = useParams()
  const nav = useNavigate()
  const hoja = useBoveda((s) => s.hojas.find((h) => String(h.id) === id))
  const [remote, setRemote] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (hoja) return setState('ok')
    get(`/hojas/${id}`)
      .then((h) => { setRemote(h); setState('ok') })
      .catch(() => setState('missing'))
  }, [id, hoja])

  const h = hoja || remote
  return (
    <div className="mod-scroll" style={{ padding: 16, alignItems: 'center' }}>
      <div style={{ width: 'min(920px, 100%)' }} className="col">
        <div className="row">
          <button className="btn ghost sm" onClick={() => nav('/')}><ArrowLeft size={15} /> Bóveda</button>
        </div>
        <div className="glass card neon-edge lit" style={{ padding: 28 }}>
          {state === 'loading' && <Loader />}
          {state === 'missing' && !h && <Empty icon={FileQuestion} title="Hoja no encontrada">Puede haber sido movida a Basura.</Empty>}
          {h && <HojaDetail hoja={h} full />}
        </div>
      </div>
    </div>
  )
}
