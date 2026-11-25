import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Cross-platform: allure.cmd on Windows, allure on macOS/Linux (used only to GENERATE the report).
const bin = process.platform === 'win32' ? 'allure.cmd' : 'allure';
const PREFERRED_PORT = 5050;

interface ServerInfo {
  pid: number;
  port: number;
}

function readInfo(file: string): ServerInfo | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ServerInfo;
  } catch {
    return undefined;
  }
}

// Stops the report server of the previous run; otherwise it would serve a stale (deleted) report.
function stopPreviousServer(file: string) {
  const info = readInfo(file);
  if (!info?.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(info.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(info.pid, 'SIGTERM');
    }
  } catch {
    // already gone
  }
  rmSync(file, { force: true });
}

function openUrl(url: string) {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

export default async function globalTeardown() {
  const root = process.cwd();
  const infoFile = path.join(root, '.runtime', 'allure-server.json');
  // npm adds node_modules/.bin to PATH only for npm scripts, so use the explicit path (quoted: shell mode).
  const allure = `"${path.join(root, 'node_modules', '.bin', bin)}"`;

  stopPreviousServer(infoFile);

  const result = spawnSync(`${allure} generate allure-results --clean -o allure-report`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('Allure report generation failed (is Java installed?)');
    return;
  }

  // Serve the report with a plain node process instead of `allure open`: no console window in the taskbar.
  // The next run stops it (see stopPreviousServer).
  mkdirSync(path.dirname(infoFile), { recursive: true });
  spawn(process.execPath, [path.join(root, 'scripts', 'serve-report.cjs'), 'allure-report', String(PREFERRED_PORT), infoFile], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  for (let i = 0; i < 80 && !existsSync(infoFile); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  const info = readInfo(infoFile);
  if (!info) {
    console.error('Allure report server did not start.');
    return;
  }
  const url = `http://127.0.0.1:${info.port}`;
  console.log(`Allure report: ${url}`);
  openUrl(url);
}
