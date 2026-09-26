import { test, expect } from './fixtures';

test('detener una serie desde el modal conserva las fechas existentes', async ({ page, apiUrl }) => {
  const now = new Date();
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const title = `Serie E2E ${Date.now()}`;
  const created = await fetch(`${apiUrl}/agenda/eventos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: title, fecha_inicio: `${day}T10:00:00`,
      se_repite: true, regla_repeticion: '{"frecuencia":"semanal"}',
    }),
  });
  expect(created.ok).toBeTruthy();
  const head = await created.json();

  await page.goto('/agenda?tab=mes');
  await page.getByText(title).first().click();
  await page.locator('aside').last().getByTitle('Editar').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Esta fecha es independiente')).toBeVisible();
  await dialog.getByRole('button', { name: 'Detener nuevas repeticiones' }).click();
  await dialog.getByRole('button', { name: 'Confirmar: las fechas existentes permanecen' }).click();
  await expect(dialog).toBeHidden();

  const current = await fetch(`${apiUrl}/agenda/eventos?desde=${day}&hasta=${day}`);
  const events = await current.json();
  expect(events.find((event: { id: number }) => event.id === head.id)?.serie_activa).toBe(false);
  const far = await fetch(`${apiUrl}/agenda/eventos?desde=2028-01-01&hasta=2028-01-31`);
  expect((await far.json()).filter((event: { serie_id: number }) => event.serie_id === head.id)).toHaveLength(0);
});
