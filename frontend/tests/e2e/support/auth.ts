import { expect, type Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByPlaceholder('Usuário').fill(email);
  await page.getByPlaceholder('Senha').fill(password);
  await page.getByRole('button', { name: 'ACESSAR' }).click();
}

export async function expectRolePage(page: Page, route: string, marker: RegExp) {
  await page.waitForURL(`**${route}`);
  await expect(page.getByText(marker).first()).toBeVisible();
}
