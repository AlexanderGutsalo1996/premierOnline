import { rmSync } from 'node:fs';
import path from 'node:path';

// Start every run with an empty Allure results folder, otherwise results of earlier runs
// (and of `playwright test --list`) would be merged into the new report.
export default async function globalSetup() {
  rmSync(path.join(process.cwd(), 'allure-results'), { recursive: true, force: true });
}
