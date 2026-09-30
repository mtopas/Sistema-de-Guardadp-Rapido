import { create } from 'zustand'
import { get, post, patch, del } from '../lib/api'
import { reportError, toast } from './ui'

export const useJarvis = create((set, g) => ({
  chats: [],
  chatId: null,
  messages: [],
  thinking: false,
  status: null,
  budget: null,
  inboxStats: null,

  fetchStatus: async () => {
    try {
      const [status, budget, inboxStats] = await Promise.all([
        get('/jarvis/health'),
        get('/jarvis/budget'),
        get('/jarvis/inbox/stats'),
      ])
      set({ status, budget, inboxStats })
    } catch { /* offline o Jarvis no disponible */ }
  },
  fetchChats: async () => {
    try { set({ chats: await get('/jarvis/chats') }) } catch { /* offline */ }
  },
  openChat: async (id) => {
    set({ chatId: id, messages: [] })
    if (!id) return
    try {
      const msgs = await get(`/jarvis/chats/${id}/messages`)
      if (g().chatId === id) set({ messages: msgs })
    } catch (e) { reportError(e) }
  },
  newChat: () => set({ chatId: null, messages: [] }),
  renameChat: async (id, title) => {
    set((s) => ({ chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)) }))
    try { await patch(`/jarvis/chats/${id}`, { title }) } catch (e) { reportError(e) }
  },
  deleteChat: async (id) => {
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id), ...(s.chatId === id ? { chatId: null, messages: [] } : {}) }))
    try { await del(`/jarvis/chats/${id}`) } catch (e) { reportError(e) }
  },
  ask: async (question) => {
    const userMsg = { role: 'user', content: question, created_at: new Date().toISOString() }
    set((s) => ({ messages: [...s.messages, userMsg], thinking: true }))
    try {
      const r = await post('/jarvis/query', { question, conversation_id: g().chatId || undefined })
      set((s) => ({
        messages: [...s.messages, { role: 'assistant', content: r.answer, sources: r.sources, meta: r, created_at: new Date().toISOString() }],
        chatId: r.conversation_id || s.chatId,
        thinking: false,
      }))
      g().fetchChats()
    } catch (e) {
      set((s) => ({
        thinking: false,
        messages: [...s.messages, { role: 'assistant', content: `⚠ ${e.message}`, error: true, created_at: new Date().toISOString() }],
      }))
    }
  },
  capture: async (content, opts = {}) => {
    try {
      const r = await post('/jarvis/capture', { content, source: 'desktop', ...opts })
      toast('Capturado en la memoria de Jarvis')
      g().fetchStatus()
      return r
    } catch (e) {
      reportError(e)
    }
  },

  browse: (q) => get('/jarvis/browse', q),
  statsTypes: () => get('/jarvis/stats/types'),
  tags: () => get('/jarvis/tags'),
  entities: () => get('/jarvis/entities'),
  entity: (name) => get(`/jarvis/entities/${encodeURIComponent(name)}`),
  projects: () => get('/jarvis/projects'),
  inbox: (status) => get('/jarvis/inbox', { limit: 50, status }),
  events: () => get('/jarvis/events', { limit: 40 }),
  proposals: () => get('/jarvis/proposals'),
  auditProposals: () => get('/jarvis/audit-proposals'),
  acceptProposal: (id, clarification) => post(`/jarvis/proposals/${id}/accept`, { clarification: clarification || null }),
  rejectProposal: (id) => post(`/jarvis/proposals/${id}/reject`),
  acceptAudit: (id, reply) => post(`/jarvis/audit-proposals/${id}/accept`, { reply: reply || null }),
  rejectAudit: (id) => post(`/jarvis/audit-proposals/${id}/reject`),
  editEntry: (id, data) => patch(`/jarvis/entries/${id}`, data),
  deleteEntry: (id) => del(`/jarvis/entries/${id}`),
}))
