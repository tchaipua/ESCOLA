import { expect, test } from '@playwright/test';
import { login } from '../support/auth';
import { loadTchaE2eState } from '../support/tcha-e2e-state';

const state = loadTchaE2eState();

test('ADMIN WEB ACESSA O PAINEL PRINCIPAL DA TCHA', async ({ page }) => {
  await login(page, state.admin.email, state.admin.password);

  await page.waitForURL('**/principal');
  await expect(page.getByRole('heading', { name: state.tenantName })).toBeVisible();
  await expect(page.getByRole('link', { name: /Pessoas e Perfis/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Grade Escolar/i })).toBeVisible();
  await expect(page.getByText(/Visões administrativas/i)).toBeVisible();
});
