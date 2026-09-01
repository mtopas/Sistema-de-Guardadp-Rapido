import { useState, useRef, useEffect } from 'react'
import { Plus, Pencil, X, Check } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { QUERY_COLOR, rgba } from '../../utils/jarvisPalette'

// Tira de chats (Mejoras_Jarvis.md punto 3 — multi-chat: crear/renombrar/
// eliminar, cada uno con su propio contexto, solo web). Vive arriba de los
// mensajes en JarvisChat -- no es un tab de JarvisSubBar porque solo tiene
// sentido dentro de "Cerebro" (chat), no en Inbox/Entidades/Debug.

function chatLabel(chat) {
  return chat.title || 'Chat sin título'
}

function ChatPill({ chat, active, onSwitch, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chatLabel(chat))
  const inputRef = useRef(null)

  useEffect(() => { if (editing) { setDraft(chat.title || ''); setTimeout(() => inputRef.current?.focus(), 0) } }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== (chat.title || '')) onRename(trimmed)
  }

  if (editing) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20,
          background: rgba(QUERY_COLOR, 0.12), border: `1px solid ${rgba(QUERY_COLOR, 0.4)}`,
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Nombre del chat"
          style={{ width: 130, background: 'transparent', border: 'none', outline: 'none', color: 'var(--jv-text-2)', fontSize: 12.5 }}
        />
        <Check size={12} style={{ cursor: 'pointer', color: QUERY_COLOR }} onClick={commit} onMouseDown={e => e.preventDefault()} />
      </div>
    )
  }

  return (
    <div
      onClick={onSwitch}
      title={chatLabel(chat)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px 6px 12px', borderRadius: 20,
        cursor: 'pointer', flex: 'none', maxWidth: 190,
        background: active ? rgba(QUERY_COLOR, 0.14) : 'rgba(150,170,255,0.05)',
        border: `1px solid ${active ? rgba(QUERY_COLOR, 0.4) : 'rgba(150,170,255,0.12)'}`,
      }}
    >
      <span
        className={active ? '' : 'jv-mono'}
        style={{
          fontSize: 12.5, color: active ? 'var(--jv-text-2)' : 'var(--jv-subtext)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110,
        }}
      >
        {chatLabel(chat)}
      </span>
      <Pencil
        size={10}
        style={{ color: 'var(--jv-mute)', flex: 'none' }}
        onClick={e => { e.stopPropagation(); setEditing(true) }}
      />
      <X
        size={11}
        style={{ color: 'var(--jv-mute)', flex: 'none' }}
        onClick={e => { e.stopPropagation(); onDelete() }}
      />
    </div>
  )
}

export default function JarvisChatTabs() {
  const { jarvisChats, jarvisActiveChatId, switchJarvisChat, createJarvisChat, renameJarvisChat, deleteJarvisChat } = useStore(
    useShallow(s => ({
      jarvisChats:      s.jarvisChats,
      jarvisActiveChatId: s.jarvisActiveChatId,
      switchJarvisChat: s.switchJarvisChat,
      createJarvisChat: s.createJarvisChat,
      renameJarvisChat: s.renameJarvisChat,
      deleteJarvisChat: s.deleteJarvisChat,
    }))
  )

  function handleDelete(chat) {
    if (window.confirm(`¿Eliminar "${chatLabel(chat)}"? Se borra todo su historial.`)) {
      deleteJarvisChat(chat.id)
    }
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 34px',
        borderBottom: '1px solid var(--jv-border)', overflowX: 'auto', flex: 'none',
      }}
    >
      {jarvisChats.map(chat => (
        <ChatPill
          key={chat.id}
          chat={chat}
          active={chat.id === jarvisActiveChatId}
          onSwitch={() => switchJarvisChat(chat.id)}
          onRename={title => renameJarvisChat(chat.id, title)}
          onDelete={() => handleDelete(chat)}
        />
      ))}
      <button
        onClick={() => createJarvisChat()}
        title="Nuevo chat"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
          borderRadius: '50%', flex: 'none', border: '1px dashed rgba(150,170,255,0.24)',
          background: 'transparent', color: 'var(--jv-subtext)', cursor: 'pointer',
        }}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}
