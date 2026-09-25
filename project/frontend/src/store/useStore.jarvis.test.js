import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let useStore
beforeAll(async () => {
  const backing = {}
  globalThis.localStorage = {
    getItem: k => backing[k] ?? null,
    setItem: (k, value) => { backing[k] = String(value) },
    removeItem: k => { delete backing[k] },
  }
  globalThis.window = { location: { pathname: '/jarvis' } }
  globalThis.document = {
    documentElement: { style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return '' } }, dataset: {} },
  }
  ;({ useStore } = await import('./useStore.js'))
})

beforeEach(() => {
  useStore.setState({
    jarvisActiveChatId: 'chat-a', jarvisMessages: [], jarvisLoading: false,
    jarvisHealth: { worker_alive: true }, fetchJarvisChats: vi.fn(),
  })
})

describe('Jarvis chat y estado del worker', () => {
  it('no agrega una respuesta tardía al chat que quedó activo', async () => {
    let finishQuery
    globalThis.fetch = vi.fn(() => new Promise(resolve => { finishQuery = resolve }))
    const pending = useStore.getState().jarvisQuery('Pregunta del chat A')
    useStore.setState({ jarvisActiveChatId: 'chat-b', jarvisMessages: [{ role: 'user', content: 'Chat B' }], jarvisLoading: false })
    finishQuery({ ok: true, json: async () => ({ answer: 'Respuesta del chat A', sources: [] }) })
    await pending

    expect(useStore.getState().jarvisMessages).toEqual([{ role: 'user', content: 'Chat B' }])
    expect(useStore.getState().jarvisLoading).toBe(false)
  })

  it('marca al worker como no disponible si falla health', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('sin conexión'))
    await useStore.getState().fetchJarvisHealth()
    expect(useStore.getState().jarvisHealth.worker_alive).toBe(false)
    errorLog.mockRestore()
  })
})
