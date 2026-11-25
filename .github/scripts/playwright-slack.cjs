const { readFileSync } = require('node:fs');

// Slack mrkdwn: only & < > must be escaped.
const escapeSlack = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MAX_LISTED = 15;
const DEFAULT_BASE_URL = 'https://www.premieronline.com'; // keep in sync with config/env.ts

function collectIssues(report) {
  const failed = [];
  const flaky = [];
  function visit(suite, parents) {
    // Skip the file-level suite title (it is the spec file name), keep describe titles.
    const titles = suite.file && suite.title === suite.file ? parents : [...parents, suite.title];
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (!['unexpected', 'flaky'].includes(test.status)) continue;
        // Titles are static and credential-free by project rule; errors are never included.
        const title = [...titles, spec.title].filter(Boolean).join(' › ');
        const entry = `${escapeSlack(title)} — ${escapeSlack(spec.file || suite.file || 'unknown')}:${spec.line || '?'}`;
        (test.status === 'flaky' ? flaky : failed).push(entry);
      }
    }
    for (const child of suite.suites || []) visit(child, titles);
  }
  for (const suite of report.suites || []) visit(suite, []);
  return { failed, flaky };
}

function listSection(header, icon, items) {
  if (!items.length) return [];
  const lines = [header, ...items.slice(0, MAX_LISTED).map((item) => `${icon} ${item}`)];
  if (items.length > MAX_LISTED) lines.push(`…and ${items.length - MAX_LISTED} more in the report.`);
  return lines;
}

// 15.1 s under a minute, 3 m 47 s from a minute up.
function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 59.95) return `${seconds.toFixed(1)} s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h ? `${h} h ` : ""}${m} m ${total % 60} s`;
}

function buildMessage(report, env) {
  const stats = report?.stats;
  const flakyCount = stats?.flaky || 0;
  const passed = env.JOB_STATUS === 'success' && !!stats; // a missing report is never "passed"
  const status = !passed ? '❌ Failed' : flakyCount > 0 ? '⚠️ Passed with flaky tests' : '✅ Passed';

  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || 'unknown';
  const lines = [
    `*Premiereonline UI Tests — ${status}*`,
    `Repository: ${escapeSlack(env.GITHUB_REPOSITORY || 'unknown')} | Branch: ${escapeSlack(branch)}`,
    `Trigger: ${escapeSlack(env.GITHUB_EVENT_NAME || 'unknown')} | Run #${escapeSlack(env.GITHUB_RUN_NUMBER || '?')}`,
    `Environment: ${escapeSlack(env.BASE_URL || DEFAULT_BASE_URL)}`,
  ];

  if (stats) {
    const { expected = 0, unexpected = 0, flaky = 0, skipped = 0, duration = 0 } = stats;
    lines.push(
      `*Total:* ${expected + unexpected + flaky + skipped} | ✅ Passed: ${expected} | ❌ Failed: ${unexpected} | ⚠️ Flaky: ${flaky} | ⏭️ Skipped: ${skipped}`,
      `Duration: ${formatDuration(duration)}`
    );
    const { failed, flaky: flakyTests } = collectIssues(report);
    lines.push(
      ...listSection('*Failed tests:*', '❌', failed),
      ...listSection('*Flaky tests (passed on retry):*', '⚠️', flakyTests)
    );
  } else {
    lines.push(`Test job: ${escapeSlack(env.JOB_STATUS || 'unknown')} | No JSON report available (setup or execution may have failed).`);
  }

  // Report = our tracker, Report Al = Allure, Report PW = Playwright HTML, GitHub = the Actions run.
  const links = [];
  if (env.PAGES_URL) {
    // GitHub Pages is on: every link opens straight in the browser.
    const base = env.PAGES_URL.endsWith('/') ? env.PAGES_URL : `${env.PAGES_URL}/`;
    links.push(`<${base}tracker/|Report>`, `<${base}allure/|Report Al>`, `<${base}playwright/|Report PW>`);
  } else {
    // Pages is off: artifacts are zip downloads and cannot open in the browser.
    if (env.TRACKER_URL) links.push(`<${env.TRACKER_URL}|Report (zip)>`);
    if (env.ALLURE_HTML_URL) links.push(`<${env.ALLURE_HTML_URL}|Report Al (zip)>`);
    if (env.PW_URL) links.push(`<${env.PW_URL}|Report PW (zip)>`);
  }
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    links.push(`<${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}|GitHub>`);
  }
  if (links.length) lines.push(links.join(' | '));

  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}

async function main() {
  if (!process.env.SLACK_WEBHOOK_URL) {
    if (process.env.EXTERNAL_PR === 'true') {
      console.warn('Slack notification skipped: GitHub does not expose secrets to fork PRs.');
      return;
    }
    throw new Error('Slack webhook unavailable');
  }
  let report;
  try {
    report = JSON.parse(readFileSync('playwright-summary.json', 'utf8'));
  } catch {
    console.warn('Playwright JSON summary unavailable; sending workflow status only.');
  }
  const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildMessage(report, process.env)),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Slack returned a non-success response');
  console.log('Slack notification delivered.');
}

module.exports = { buildMessage };
if (require.main === module) {
  main().catch(() => {
    // Never print fetch errors or webhook URLs.
    console.error('Slack notification failed. Check webhook configuration and availability.');
    process.exitCode = 1;
  });
}
