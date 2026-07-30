import { expect, test } from '@playwright/test';
import { login } from '../support/auth';
import { loadTchaE2eState } from '../support/tcha-e2e-state';

const state = loadTchaE2eState();

test('ADMIN WEB ACESSA O PAINEL PRINCIPAL DA TCHA', async ({ page }) => {
  const authorizationHeaders: string[] = [];
  page.on('request', (request) => {
    const authorization = request.headers().authorization;
    if (authorization) authorizationHeaders.push(authorization);
  });

  const loginResponse = await login(page, state.admin.email, state.admin.password);
  const loginPayload = await loginResponse.json();

  await expect(page).toHaveURL(/\/principal($|\/)/, { timeout: 120_000 });
  await expect(
    page.getByRole('button', { name: new RegExp(state.tenantName, 'i') }).first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Controle Escolar' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Controle Pessoas/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Configura Escola/i })).toBeVisible();
  await expect(page.getByText(/Visões administrativas/i)).toBeVisible();

  expect(loginPayload).not.toHaveProperty('access_token');
  expect(authorizationHeaders).toEqual([]);

  const legacyTokens = await page.evaluate(() => ({
    local: localStorage.getItem('@Escola-PWA-Token'),
    session: sessionStorage.getItem('@Escola-PWA-Token'),
  }));
  expect(legacyTokens).toEqual({ local: null, session: null });

  const sessionCookie = (await page.context().cookies()).find((cookie) =>
    cookie.name.endsWith('msinfor_escola_session'),
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe('Strict');
});
