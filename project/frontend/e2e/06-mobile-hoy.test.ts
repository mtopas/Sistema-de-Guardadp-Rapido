import { expect, test } from '@playwright/test'

test.describe('shell móvil Hoy', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('abre con un único resumen y completa una captura de tarea por texto', async ({ page }) => {
    const apiCalls: string[] = []
    let createdTask: Record<string, unknown> | null = null

    page.on('request', request => {
      const url = new URL(request.url())
      if (url.port === '8765') apiCalls.push(url.pathname)
    })

    await page.route('http://127.0.0.1:8765/mobile/hoy', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fecha: '2026-10-07',
        proximo_bloque: { tipo: 'evento', id: 1, titulo: 'Planificar sprint', hora: '14:00', fin: '15:00', color: '#2563eb' },
        tareas: [{ id: 2, titulo: 'Revisar números', fecha: '2026-10-07', hora: null, lista: 'Trabajo', color: '#7c3aed', vencida: false }],
        habitos_pendientes: [{ id: 3, nombre: 'Caminar', hora: null, color: '#059669', progreso: 0 }],
        alertas_financieras: [],
      }),
    }))
    await page.route('http://127.0.0.1:8765/agenda/listas', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 7, nombre: 'Trabajo', color: '#2563eb' }]),
    }))
    await page.route('http://127.0.0.1:8765/agenda/tareas', async route => {
      createdTask = await route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 99, ...createdTask }),
      })
    })

    await page.goto('/mobile')

    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
    await expect(page.getByText('Planificar sprint')).toBeVisible()
    await expect(page.getByText('Caminar')).toBeVisible()
    expect(apiCalls).toEqual(['/mobile/hoy'])

    await page.getByRole('button', { name: /Tarea/ }).click()
    await expect(page.getByTestId('mobile-destination')).toHaveText('Agenda · Hoy')
    await page.getByLabel('Lista opcional').selectOption('7')
    await expect(page.getByTestId('mobile-destination')).toHaveText('Agenda · Hoy · Trabajo')
    await page.getByLabel('Texto').fill('Enviar resumen móvil')
    await page.getByRole('button', { name: 'Confirmar en Tarea' }).click()

    await expect(page.getByText('Tarea creada para hoy')).toBeVisible()
    expect(createdTask).toEqual({ titulo: 'Enviar resumen móvil', fecha_opcional: '2026-10-07', lista_id: 7 })
    expect(apiCalls).toEqual(['/mobile/hoy', '/agenda/listas', '/agenda/tareas', '/mobile/hoy'])
  })

  test('conserva jerarquía y evita overflow en móvil, tablet y desktop', async ({ page }) => {
    await page.route('http://127.0.0.1:8765/mobile/hoy', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fecha: '2026-10-07',
        proximo_bloque: { tipo: 'evento', id: 1, titulo: 'Planificar sprint', hora: '14:00', fin: '15:00', color: '#2563eb' },
        tareas: [
          { id: 2, titulo: 'Revisar números', fecha: '2026-10-07', hora: null, lista: 'Trabajo', color: '#7c3aed', vencida: false },
          { id: 3, titulo: 'Confirmar turno', fecha: '2026-10-06', hora: '17:30', lista: null, color: '#7c3aed', vencida: true },
        ],
        habitos_pendientes: [
          { id: 4, nombre: 'Caminar', hora: null, color: '#059669', progreso: 0 },
          { id: 5, nombre: 'Leer', hora: '22:00', color: '#d97706', progreso: 0.5 },
        ],
        alertas_financieras: [{ tipo: 'saldo_negativo', cuenta_id: 6, cuenta: 'Efectivo', moneda: 'ARS', monto: -2450 }],
      }),
    }))

    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/mobile')
      await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `test-results/mobile-hoy-${viewport.name}.png`, fullPage: true })
    }
  })
})
