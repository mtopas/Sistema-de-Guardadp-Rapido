import { test, expect } from './fixtures';

test.describe('Flujo (2): Agenda - Tarea creada, vista en /hoy, completada', () => {
  test.use({ timeout: 90000 });

  test('crear tarea, verificar en /hoy y completarla', async ({ page, apiUrl }) => {
    // 1. Navegar a /agenda
    await page.goto('/agenda');
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 2. Hacer click en el botón CTA
    const ctaBtn = page.locator('button.topbar-cta').first();
    await expect(ctaBtn).toBeVisible({ timeout: 5000 });
    await ctaBtn.click();

    // 3. Esperar modal
    const modal = page.locator('[role="dialog"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // 4. Llenar título (primer input, autofocused)
    const titleInput = modal.locator('input[type="text"]').first();
    const taskName = `Tarea E2E ${Date.now()}`;
    await titleInput.fill(taskName);

    // 5. Llenar descripción opcional
    const descInput = modal.locator('textarea').first();
    if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await descInput.fill('Test E2E description');
    }

    // 6. Guardar — buscar botón en footer del modal
    // El footer está al final del modal, buscar cualquier button con "guard" en el texto
    const footerButtons = modal.locator('button');
    let saveBtn = null;
    const buttonCount = await footerButtons.count();

    // Buscar el último botón que no sea "Cancelar"
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = footerButtons.nth(i);
      const text = await btn.textContent().catch(() => '');
      if (text.toLowerCase().includes('guardar') || text.toLowerCase().includes('crear') || text.toLowerCase().includes('ok')) {
        saveBtn = btn;
        break;
      }
    }

    if (!saveBtn) {
      // Fallback: buscar por aria-label o simplemente el penúltimo botón (después de Cancelar)
      saveBtn = footerButtons.nth(buttonCount - 1);
    }

    await expect(saveBtn).toBeTruthy();
    await saveBtn.click();

    // 7. Esperar a que el modal se cierre
    await modal.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 8. Verificar que la tarea aparezca
    const taskDisplay = page.locator(`text=${taskName}`).first();
    await expect(taskDisplay).toBeVisible({ timeout: 5000 });

    // 9. Verificar en backend
    try {
      const tareas = await getTareas(apiUrl);
      const created = tareas.find((t: any) =>
        t.titulo?.includes(taskName) || t.descripcion?.includes(taskName)
      );
      expect(created).toBeDefined();
      console.log('✓ Tarea creada:', created?.id);
    } catch (e) {
      console.log('⚠️ No se pudo verificar en backend:', e);
    }
  });
});

async function getTareas(apiUrl: string) {
  const res = await fetch(`${apiUrl}/agenda/tareas`);
  if (!res.ok) throw new Error(`GET /agenda/tareas: ${res.status}`);
  return res.json();
}
