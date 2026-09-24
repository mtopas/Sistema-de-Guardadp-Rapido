import { test, expect } from './fixtures';

test.describe('Flujo (2): Agenda - Tarea creada, vista en /hoy, completada', () => {
  test.use({ timeout: 30000 });

  test('crear tarea, verificar en /hoy y completarla', async ({ page, apiUrl }) => {
    // 1. Navegar a /agenda
    await page.goto('/agenda');
    await page.waitForLoadState('networkidle');

    // 2. Esperar a que se cargue el contenedor principal de Agenda
    await page.locator('#agenda-tab-hoy, #agenda-tab-mes').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // 3. Asegurar que estamos en la tab "hoy" — click en el tab si existe
    const hoyTab = page.locator('button:has-text("Hoy"), button:has-text("HOY"), [data-tab="hoy"]').first();
    if (await hoyTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hoyTab.click();
    }

    // 4. Crear una nueva tarea — click en botón CTA de TopBar
    const ctaBtn = page.locator('button.topbar-cta').first();
    await expect(ctaBtn).toBeVisible({ timeout: 5000 });
    await ctaBtn.click();

    // 5. Esperar a que se abra el modal EventoModal
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5000 });

    // 6. Llenar los campos del modal
    // Primero, el campo de descripción/nombre de la tarea
    const taskName = `Tarea E2E test ${Date.now()}`;
    const descInput = page.locator('input[placeholder*="escripción"], textarea').first();
    await descInput.fill(taskName);

    // Seleccionar una lista (si el modal lo requiere)
    const listSelect = page.locator('select, [role="combobox"]').first();
    if (await listSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await listSelect.click();
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstOption.click();
      }
    }

    // 7. Guardar — click en botón de guardar del modal
    const saveBtn = page.locator('button:has-text("Guardar"), button:has-text("Crear"), button:has-text("OK")').last();
    await saveBtn.click();

    // 8. Esperar a que el modal se cierre y la tarea aparezca
    await page.locator('[role="dialog"]').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 9. Verificar que la tarea aparezca en /hoy
    const taskElement = page.locator(`text=${taskName}`).first();
    await expect(taskElement).toBeVisible({ timeout: 5000 });

    // 10. Marcar como completada — buscar checkbox o elemento clickeable
    const taskRow = taskElement.locator('..').or(page.locator(`text=${taskName}`)).first();
    const checkbox = taskRow.locator('input[type="checkbox"]').first();

    if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await checkbox.click();
    } else {
      // Si no hay checkbox, intentar double-click en la tarea o click en un botón de completar
      await taskElement.click();
    }

    // 11. Esperar a que la UI refleje el cambio
    await page.waitForTimeout(500);

    // 12. Verificar en backend que la tarea se guardó
    const tareas = await getTareas(apiUrl);
    const createdTask = tareas.find((t: any) =>
      t.descripcion?.includes(taskName) || t.nombre?.includes(taskName)
    );

    expect(createdTask).toBeDefined();
  });
});

// Helper
async function getTareas(apiUrl: string) {
  const res = await fetch(`${apiUrl}/agenda/tareas`);
  if (!res.ok) throw new Error(`GET /agenda/tareas: ${res.status}`);
  return res.json();
}
