/**
 * Loads apps/api/.env (DATABASE_URL) then runs the local Prisma CLI.
 * Avoids P1012 when the shell does not export env (PM2, background jobs, non-bash).
 */
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { config } = require('dotenv');

/** `packages/db` (where this file and prisma/schema live). */
const root = __dirname;
const envPath = join(root, '../../apps/api/.env');

if (!existsSync(envPath)) {
  console.error(`[prisma] Missing env file: ${envPath}`);
  process.exit(1);
}

const loaded = config({ path: envPath });
if (loaded.error) {
  console.error('[prisma] dotenv:', loaded.error);
  process.exit(1);
}

if (!process.env.DATABASE_URL || String(process.env.DATABASE_URL).trim() === '') {
  console.error(`[prisma] DATABASE_URL is empty after loading ${envPath}`);
  process.exit(1);
}

let prismaCli;
try {
  prismaCli = require.resolve('prisma/build/index.js', { paths: [root] });
} catch {
  console.error('[prisma] Cannot find prisma package. Run pnpm install in the monorepo root.');
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node prisma-with-api-env.cjs <prisma subcommand> [...]');
  process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
