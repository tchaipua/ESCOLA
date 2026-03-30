import { expect, test } from '@playwright/test';
import { login, expectRolePage } from '../support/auth';
import { loadTchaE2eState } from '../support/tcha-e2e-state';

const state = loadTchaE2eState();

test.describe.serial('FLUXO PWA TCHA', () => {
  test('PROFESSOR SALVA CHAMADA E NOTAS PELA PWA', async ({ page }) => {
    await login(page, state.teacher.email, state.teacher.password);
    await expectRolePage(page, '/professor', /PWA do professor/i);

    await expect(page.getByText(state.tenantName, { exact: true }).first()).toBeVisible();

    await page.locator('input[type="date"]').fill(state.proof.lessonDate);
    await expect(page.getByText(state.proof.lessonDateLabel).first()).toBeVisible();

    const lessonButton = page.getByRole('button').filter({
      hasText: state.proof.lesson.subjectName,
    }).filter({
      hasText: `${state.proof.lesson.seriesName} - ${state.proof.lesson.className}`,
    }).filter({
      hasText: `${state.proof.lesson.startTime} - ${state.proof.lesson.endTime}`,
    }).filter({
      hasText: state.proof.lessonDateLabel,
    }).first();

    await lessonButton.click();

    const attendanceCard = page
      .locator('div.rounded-2xl.border.border-slate-100.bg-slate-50')
      .filter({ hasText: state.studentA.name })
      .first();

    await expect(attendanceCard.getByText(state.studentA.name, { exact: true })).toBeVisible();
    await attendanceCard.getByRole('button', { name: 'Faltou' }).click();
    await attendanceCard.getByPlaceholder('Observacao da chamada').fill(state.uiEdits.attendanceNote);
    await page.getByRole('button', { name: 'Salvar chamada' }).click();
    await expect(attendanceCard.getByPlaceholder('Observacao da chamada')).toHaveValue(state.uiEdits.attendanceNote);

    await page.getByRole('button', { name: 'notas' }).click();

    const assessmentButton = page.getByRole('button').filter({
      hasText: state.proof.title,
    }).first();

    await assessmentButton.click();
    await expect(page.getByText(state.proof.title, { exact: true })).toBeVisible();

    const assessmentCard = page
      .locator('div.rounded-2xl.border.border-slate-100.bg-slate-50')
      .filter({ hasText: state.studentA.name })
      .first();

    await assessmentCard.getByPlaceholder('Nota').fill(state.uiEdits.score);
    await assessmentCard.getByPlaceholder('Observacao').fill(state.uiEdits.remarks);
    await page.getByRole('button', { name: 'Salvar notas' }).click();
    await expect(assessmentCard.getByPlaceholder('Nota')).toHaveValue(String(state.uiEdits.scoreNumeric));
    await expect(assessmentCard.getByPlaceholder('Observacao')).toHaveValue(state.uiEdits.remarks);
  });

  test('ALUNO VE APENAS SUA NOTA E SUAS NOTIFICACOES', async ({ page }) => {
    await login(page, state.studentA.email, 'Aluno1234');
    await expectRolePage(page, '/aluno', /PWA do aluno/i);

    await expect(page.getByRole('heading', { name: state.studentA.name })).toBeVisible();
    await expect(page.getByText(state.tenantName, { exact: true }).first()).toBeVisible();

    const notificationsSection = page.locator('main');
    await expect(notificationsSection).toContainText(state.studentA.name);
    await expect(notificationsSection).not.toContainText(state.studentB.name);

    await page.getByRole('button', { name: 'notas' }).click();
    await expect(page.getByText(state.proof.title, { exact: true })).toBeVisible();
    await expect(page.getByText('9,7 / 10')).toBeVisible();
    await expect(page.getByText(state.uiEdits.remarks, { exact: true })).toBeVisible();
  });

  test('RESPONSAVEL VE APENAS O ALUNO VINCULADO E RECEBE A COMUNICACAO CERTA', async ({ page }) => {
    await login(page, state.guardianA.email, 'Resp1234');
    await expectRolePage(page, '/responsavel', /PWA do responsavel/i);

    await expect(page.getByRole('heading', { name: state.guardianA.name })).toBeVisible();
    await expect(page.locator('main')).toContainText(state.guardianA.studentName);
    await expect(page.locator('main')).not.toContainText(state.studentB.name);

    await expect(page.locator('main')).toContainText(state.guardianA.studentName);
    await expect(page.locator('main')).not.toContainText(state.guardianB.studentName);

    await page.getByRole('button', { name: 'alunos' }).click();
    await expect(page.getByText(state.guardianA.studentName, { exact: true })).toBeVisible();
    await expect(page.getByText(state.studentB.name, { exact: true })).toHaveCount(0);
  });
});
