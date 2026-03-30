import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workspaceDir = path.resolve(frontendDir, '..');
const backendDir = path.join(workspaceDir, 'backend');
const backendPrismaDir = path.join(backendDir, 'prisma');
const artifactsDir = path.join(frontendDir, 'tests', 'e2e', '.artifacts');
const outputPath = path.join(artifactsDir, 'tcha-e2e-state.json');
const templateDatabasePath = path.join(backendPrismaDir, 'tmp-test.db');
const tempDatabaseBasename = 'tmp-e2e.db';
const tempDatabaseUrl = `file:./${tempDatabaseBasename}`;

function resolveCommand(command) {
  return process.platform === 'win32' ? `${command}.cmd` : command;
}

function runCommand(command, args, cwd, env, label) {
  const result = spawnSync(resolveCommand(command), args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.error || result.status !== 0) {
    const stdout = result.stdout?.trim() || '';
    const stderr = result.stderr?.trim() || '';
    throw new Error(
      [
        `[TCHA E2E PREP] Falha em ${label}.`,
        result.error ? `ERRO:\n${result.error.message}` : '',
        stdout ? `STDOUT:\n${stdout}` : '',
        stderr ? `STDERR:\n${stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  return result.stdout || '';
}

function extractLastJsonBlock(rawText) {
  const normalized = String(rawText || '').trim();
  const lines = normalized.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim().startsWith('{')) continue;
    const candidate = lines.slice(index).join('\n').trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta blocos anteriores até encontrar o JSON final.
    }
  }

  throw new Error('[TCHA E2E PREP] Não consegui extrair o JSON final do script executado.');
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
  }
}

function toPtBrDate(dateValue) {
  return new Date(`${dateValue}T00:00:00.000Z`).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
  });
}

fs.mkdirSync(artifactsDir, { recursive: true });

const databasePath = path.join(backendPrismaDir, tempDatabaseBasename);
removeIfExists(databasePath);
removeIfExists(`${databasePath}-journal`);
removeIfExists(`${databasePath}-wal`);
removeIfExists(`${databasePath}-shm`);
removeIfExists(outputPath);

if (!fs.existsSync(templateDatabasePath)) {
  throw new Error(
    `[TCHA E2E PREP] Base de template não encontrada em ${templateDatabasePath}.`,
  );
}

fs.copyFileSync(templateDatabasePath, databasePath);

const backendEnv = {
  ...process.env,
  DATABASE_URL: tempDatabaseUrl,
  FRONTEND_URL: 'http://127.0.0.1:3000',
  PORT: '3001',
};

console.log('[TCHA E2E PREP] Base limpa copiada para tmp-e2e.db...');

console.log('[TCHA E2E PREP] Rodando smoke geral da TCHA...');
const smokeOutput = runCommand('npm', ['run', 'qa:tcha-smoke'], backendDir, backendEnv, 'qa:tcha-smoke');
const smokeSummary = extractLastJsonBlock(smokeOutput);

console.log('[TCHA E2E PREP] Rodando smoke de visibilidade e notificações...');
const visibilityOutput = runCommand(
  'npm',
  ['run', 'qa:tcha-grade-visibility'],
  backendDir,
  backendEnv,
  'qa:tcha-grade-visibility',
);
const visibilitySummary = extractLastJsonBlock(visibilityOutput);

const studentA = visibilitySummary.validatedStudents?.[0] || null;
const studentB = visibilitySummary.validatedStudents?.[1] || null;
const guardianA = visibilitySummary.validatedGuardians?.[0] || null;
const guardianB = visibilitySummary.validatedGuardians?.[1] || null;

const state = {
  generatedAt: new Date().toISOString(),
  databaseUrl: tempDatabaseUrl,
  tenantId: visibilitySummary.tenantId || smokeSummary.tenantId || null,
  tenantName: smokeSummary.tenantName || 'TCHA',
  admin: {
    email: 'ADMIN.TCHA@MSINFOR.COM',
    password: 'Admin001',
  },
  teacher: {
    email: smokeSummary.simulatedUsers?.teacher || 'PROF001.TCHA@MSINFOR.COM',
    password: 'Prof1234',
  },
  proof: {
    title: visibilitySummary.proofTitle,
    lessonItemId: visibilitySummary.lessonItemId,
    lessonDate: visibilitySummary.lessonDate,
    lessonDateLabel:
      visibilitySummary.lessonDateLabel || toPtBrDate(visibilitySummary.lessonDate),
    lesson: visibilitySummary.lesson,
  },
  studentA,
  studentB,
  guardianA,
  guardianB,
  uiEdits: {
    attendanceNote: 'E2E CHAMADA UI',
    score: '9,7',
    scoreNumeric: 9.7,
    remarks: 'AJUSTE E2E UI',
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(`[TCHA E2E PREP] Estado salvo em ${outputPath}`);
