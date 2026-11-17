import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

export default async function globalTeardown() {
  const root = process.cwd();
  const allure = path.join(root, 'node_modules', '.bin', 'allure.cmd');

  // Генеруємо Allure Report
  const result = spawnSync(
    allure,
    ['generate', 'allure-results', '--clean', '-o', 'allure-report'],
    {
      cwd: root,
      stdio: 'inherit',
      shell: true
    }
  );

  if (result.status !== 0) {
    console.error('Allure report generation failed');
    return;
  }

  // Автоматично відкриваємо звіт
  const server = spawn(
    allure,
    ['open', 'allure-report', '--port', '5050'],
    {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      shell: true
    }
  );

  server.unref();
}