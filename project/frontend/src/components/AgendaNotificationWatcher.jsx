import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { API_URL } from '../config'

export default function AgendaNotificationWatcher() {
  const enabled = useStore(s => s.agendaNotificationsEnabled)
  const minutes = useStore(s => s.agendaReminderMinutes)
  const lang = useStore(s => s.lang)
  const seen = useRef(new Set())

  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return
    let active = true
    const check = async () => {
      try {
        const response = await fetch(`${API_URL}/agenda/notificaciones/pending?ventana_min=${minutes}`)
        if (!response.ok || !active) return
        const events = await response.json()
        if (!active) return
        events.forEach(event => {
          const key = `${event.id}:${event.fecha_inicio}`
          if (seen.current.has(key)) return
          seen.current.add(key)
          new Notification(event.titulo, {
            body: `${lang === 'en' ? 'Starts at' : 'Empieza a las'} ${event.fecha_inicio?.slice(11, 16) || ''}`,
          })
        })
      } catch { /* Offline: try again on the next interval. */ }
    }
    check()
    const interval = setInterval(check, 60000)
    return () => { active = false; clearInterval(interval) }
  }, [enabled, minutes, lang])

  return null
}
