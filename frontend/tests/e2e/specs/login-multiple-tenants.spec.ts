import { expect, test } from '@playwright/test';

test('LOGIN COM MAIS DE UMA EMPRESA ABRE A SELECAO SEM EXIBIR ERRO', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'MULTIPLE_TENANTS',
        tenants: [
          { id: 'tenant-cec', name: 'CEC - CENTRO EDUCACAO CRESCER', logoUrl: null },
          { id: 'tenant-tcha', name: 'TCTCHA', logoUrl: null },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('Usuário').fill('MULTIEMPRESA@TESTE.COM');
  await page.getByPlaceholder('Senha').fill('SENHA-TESTE');
  await page.getByRole('button', { name: 'ACESSAR' }).click();

  await expect(page.getByRole('heading', { name: 'Múltiplos Vínculos' })).toBeVisible();
  await expect(page.getByRole('button', { name: /CEC - CENTRO EDUCACAO CRESCER/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /TCTCHA/ })).toBeVisible();
  await expect(page.getByRole('alertdialog', { name: 'Erro' })).toHaveCount(0);
});
