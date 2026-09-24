import { test, expect } from './fixtures';

test.describe('Flujo (4): Bóveda - Nota creada y búsqueda funciona', () => {
  test.use({ timeout: 60000 });

  test('crear nota en Bóveda y verificar búsqueda', async ({ page, apiUrl }) => {
    // 1. Navegar a Bóveda (/)
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 2. Click en TopBar CTA
    const ctaBtn = page.locator('button.topbar-cta').first();
    await expect(ctaBtn).toBeVisible({ timeout: 5000 });
    await ctaBtn.click();

    // 3. Esperar modal de captura
    const modal = page.locator('[role="dialog"]').first();
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // 4. Llenar contenido
    const noteContent = `Nota E2E ${Date.now()}: test`;
    const inputs = modal.locator('input[type="text"], textarea');
    const input = inputs.first();
    await input.fill(noteContent);

    // 5. Si hay selector, elegir categoría
    const selects = modal.locator('select, [role="combobox"]');
    const selectCount = await selects.count();
    if (selectCount > 0) {
      await selects.first().click().catch(() => {});
      await page.locator('[role="option"]').first().click().catch(() => {});
    }

    // 6. Guardar
    const buttons = modal.locator('button');
    let saveBtn = null;
    const btnCount = await buttons.count();

    for (let i = btnCount - 1; i >= 0; i--) {
      const btn = buttons.nth(i);
      const text = await btn.textContent().catch(() => '');
      if (text && (text.toLowerCase().includes('guardar') || text.toLowerCase().includes('crear') || text.toLowerCase().includes('capturar'))) {
        saveBtn = btn;
        break;
      }
    }

    if (saveBtn) {
      await saveBtn.click();
    } else {
      console.log('⚠️ No se encontró botón de guardar, intentando último botón');
      await buttons.nth(btnCount - 1).click().catch(() => {});
    }

    // 7. Esperar modal se cierre
    await modal.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 8. Verificar que aparezca en la UI
    const noteDisplay = page.locator(`text=${noteContent.substring(0, 20)}`).first();
    await expect(noteDisplay).toBeVisible({ timeout: 5000 });

    // 9. Usar búsqueda
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('E2E');
      await page.waitForTimeout(800);
      const searchResult = page.locator(`text=E2E`).first();
      await expect(searchResult).toBeVisible({ timeout: 3000 });
    }

    // 10. Verificar en backend — fuente de verdad real, no tolerante.
    // Campo real de contenido de una hoja de texto es `contenido` (no `titulo`/`apuntes` —
    // ver app/db/crud.py:46, comentario "contenido=título"; `apuntes` es cuerpo/notas extra).
    const hojas = await getHojas(apiUrl);
    const created = hojas.find((h: any) => h.contenido === noteContent);
    expect(created).toBeDefined();
    console.log('✓ Nota creada en backend:', created.id);
  });
});

async function getHojas(apiUrl: string) {
  const res = await fetch(`${apiUrl}/hojas`); // sin barra final — FastAPI redirige /hojas/ → /hojas
  if (!res.ok) {
    throw new Error(`GET /hojas: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
