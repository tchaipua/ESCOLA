const { spawnSync } = require('node:child_process');

const prismaCli = require.resolve('prisma/build/index.js');
const validationUrl =
  'postgresql://schema_validator:unused@127.0.0.1:5432/schema_validation?schema=public';

const result = spawnSync(
  process.execPath,
  [prismaCli, 'validate', '--schema', 'prisma/postgresql/schema.prisma'],
  {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: {
      ...process.env,
      POSTGRES_DATABASE_URL: validationUrl,
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
