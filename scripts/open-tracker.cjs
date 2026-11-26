// Opens the last test report in the default browser: npm run report:tracker
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const file = resolve(__dirname, '../tracker-report/index.html');
if (!existsSync(file)) {
  console.error('No tracker report yet. Run the tests first: npm test');
  process.exit(1);
}
const [command, args] =
  process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
console.log(`Opened ${file}`);
