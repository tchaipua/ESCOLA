import { expect, type Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByPlaceholder('Usuário').fill(email);
  await page.getByPlaceholder('Senha').fill(password);
  await page.getByRole('button', { name: 'ACESSAR' }).click();
}

export async function expectRolePage(page: Page, route: string) {
  const routePattern = route.replace('/', '\\/');
  const allowedPattern = new RegExp(`(${routePattern}|\\/principal)($|\\/)`);

  await expect
    .poll(() => new URL(page.url()).pathname, {
      timeout: 120_000,
    })
    .toMatch(allowedPattern);

  if (new URL(page.url()).pathname.startsWith('/principal')) {
    await page.goto(route);
  }

  await expect(page).toHaveURL(new RegExp(`${routePattern}($|\\/)`), {
    timeout: 120_000,
  });
}
