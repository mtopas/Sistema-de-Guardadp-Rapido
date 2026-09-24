import { test, expect } from './fixtures';

/**
 * Flujo E2E (2): Tarea creada en web → aparece en `/hoy` → callback la completa.
 *
 * Nota de diseño (hallazgo de la sesión): el CTA global de TopBar ("Nuevo evento") abre
 * EventoModal, que crea un EVENTO de calendario, no una TAREA — son entidades distintas
 * (agenda_eventos vs agenda_tareas). El flujo real de creación rápida de tareas es el
 * input "quick-add" dentro del panel de tareas pendientes en la tab HOY
 * (HoyTab.jsx:428, aria-label = i18n key 'agendaTareaRapida'), que llama a
 * `addAgendaTarea({ titulo, fecha_opcional })` al presionar Enter.
 * Completar se hace con el botón aria-label="Completar" en TareaPendienteCard (HoyTab.jsx:66),
 * que llama a `updateAgendaTarea(tarea.id, { completada: true })`.
 */

test.describe('Flujo (2): Agenda - Tarea creada, vista en /hoy, completada', () => {
  test.use({ timeout: 30000 });

  test('crear tarea vía quick-add, verificar en /hoy y completarla', async ({ page, apiUrl }) => {
    // 1. Navegar directo a la tab "hoy" de Agenda
    await page.goto('/agenda?tab=hoy');
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    // 2. Encontrar el input de quick-add de tareas por su placeholder real (i18n: agendaTareaRapida)
    const taskInput = page.locator('input[placeholder="Nueva tarea..."]').first();
    await expect(taskInput).toBeVisible({ timeout: 10000 });

    // 3. Escribir el nombre de la tarea y confirmar con Enter
    const taskName = `Tarea E2E ${Date.now()}`;
    await taskInput.fill(taskName);
    await taskInput.press('Enter');

    // 4. Esperar a que la tarea aparezca en la lista de pendientes
    const taskDisplay = page.locator(`text=${taskName}`).first();
    await expect(taskDisplay).toBeVisible({ timeout: 5000 });

    // 5. Verificar en backend que la tarea se guardó
    const tareasAfterCreate = await getTareas(apiUrl);
    const created = tareasAfterCreate.find((t: any) => t.titulo === taskName);
    expect(created).toBeDefined();
    expect(created.completada).toBeFalsy();

    // 6. Marcar como completada — click en el botón "Completar" de esa tarjeta
    const taskCard = taskDisplay.locator('xpath=ancestor::div[contains(@class, "panel-strong")]').first();
    const completeBtn = taskCard.locator('button[aria-label="Completar"]').first();
    await expect(completeBtn).toBeVisible({ timeout: 3000 });
    await completeBtn.click();

    // 7. La lista "Próximas tareas" filtra por pendientes — al completarse, la tarjeta
    // desaparece de esta vista (comportamiento real de la app, confirmado viendo el DOM
    // tras el click: pasa a "Sin tareas próximas"). Verificamos que deje de estar visible.
    await expect(taskDisplay).toBeHidden({ timeout: 3000 });

    // 8. Verificar en backend que quedó completada — fuente de verdad del callback
    const tareasAfterComplete = await getTareas(apiUrl);
    const completedTask = tareasAfterComplete.find((t: any) => t.id === created.id);
    expect(completedTask).toBeDefined();
    expect(completedTask.completada).toBeTruthy();
  });
});

async function getTareas(apiUrl: string) {
  const res = await fetch(`${apiUrl}/agenda/tareas`);
  if (!res.ok) throw new Error(`GET /agenda/tareas: ${res.status}`);
  return res.json();
}
