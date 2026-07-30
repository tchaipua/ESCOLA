import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(frontendDir, 'src');
const sourceFiles = [];

function collectSourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath);
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(absolutePath);
    }
  }
}

collectSourceFiles(sourceDir);

const forbiddenPatterns = [
  {
    label: 'cabeçalho Authorization',
    pattern: /(?:['"]Authorization['"]|Authorization)\s*:/,
  },
  {
    label: 'mutação manual de Authorization',
    pattern: /\.set\(\s*['"]Authorization['"]/,
  },
  {
    label: 'Bearer montado no navegador',
    pattern: /Bearer\s+\$\{/,
  },
  {
    label: 'access_token exposto ao frontend',
    pattern: /\baccess_token\b/,
  },
  {
    label: 'decodificação de JWT no navegador',
    pattern: /\bdecodeDashboardToken\b/,
  },
];

const violations = [];
for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      violations.push(
        `${path.relative(frontendDir, filePath)}: ${rule.label}`,
      );
    }
  }
}

const authStorage = fs.readFileSync(
  path.join(sourceDir, 'app', 'lib', 'auth-storage.ts'),
  'utf8',
);
if (/setItem\(\s*LEGACY_TOKEN_KEY/.test(authStorage)) {
  violations.push('auth-storage.ts: token legado ainda pode ser persistido');
}

const csrfFetch = fs.readFileSync(
  path.join(sourceDir, 'app', 'lib', 'csrf-fetch.ts'),
  'utf8',
);
if (!/headers\.delete\(\s*['"]authorization['"]\s*\)/.test(csrfFetch)) {
  violations.push('csrf-fetch.ts: defesa global contra Authorization ausente');
}

if (violations.length > 0) {
  throw new Error(
    `Contrato de autenticação somente por cookie violado:\n- ${violations.join('\n- ')}`,
  );
}

console.log(
  `Cookie-only auth check passed (${sourceFiles.length} arquivos verificados).`,
);
