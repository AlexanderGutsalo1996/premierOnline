const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const cli = resolve(__dirname, '../node_modules/@playwright/test/cli.js');
const args = process.argv.slice(2);
if (!args.length) args.push('tests/evidence-demo.spec.ts');
const result = spawnSync(process.execPath, [cli, 'test', ...args], {
  stdio: 'inherit',
  env: { ...process.env, EVIDENCE_MODE: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
