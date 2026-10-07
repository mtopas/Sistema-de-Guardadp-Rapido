import { test, expect } from './fixtures';

const hoja = {
  id: 42,
  contenido: 'Nota responsive',
  apuntes: '<p>Contenido de prueba</p>',
  categoria_id: 1,
  categoria_nombre: 'Inbox',
  tipo: 'texto',
  fecha: '2026-10-07T12:00:00Z',
  icono: null,
  color: null,
};

test.describe('Bóveda - controles de hoja responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/hojas', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([hoja]),
    }));
    await page.route('**/categorias', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, nombre: 'Inbox', padre_id: null }]),
    }));
  });

  for (const viewport of [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`mantiene guardar y eliminar accesibles en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/hoja/42');

      const info = page.getByTestId('hoja-info-panel');
      await expect(info).toBeVisible();
      await expect(info.getByRole('heading', { name: 'Información' })).toBeVisible();
      await expect(info.getByRole('button', { name: 'Eliminar hoja' })).toBeVisible();

      await page.getByPlaceholder('Título de la hoja').fill('Nota responsive editada');
      await expect(info.getByRole('button', { name: 'Guardar' })).toBeVisible();

      for (const buttonName of ['Guardar', 'Eliminar hoja']) {
        const button = info.getByRole('button', { name: buttonName });
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport();
        const box = await button.boundingBox();
        expect(box, `${buttonName} no tiene geometría visible`).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
        if (viewport.width < 768) {
          const mobileNavBox = await page.locator('nav.fixed').boundingBox();
          expect(mobileNavBox).not.toBeNull();
          expect(box!.y + box!.height).toBeLessThanOrEqual(mobileNavBox!.y);
        }
      }

    });
  }
});
