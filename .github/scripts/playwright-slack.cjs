const { readFileSync } = require('node:fs');

const escapeSlack = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildMessage(report, env) {
  const outcome = env.JOB_STATUS === 'success' && env.TEST_OUTCOME === 'success';
  const status = outcome ? '✅ Passed' : '❌ Failed';
  const lines = [
    `*Playwright Tests — ${status}*`,
    `Repository: ${escapeSlack(env.GITHUB_REPOSITORY || 'unknown')}`,
    `Branch: ${escapeSlack(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || 'unknown')}`,
    `Trigger: ${escapeSlack(env.GITHUB_EVENT_NAME || 'unknown')} | Run #${escapeSlack(env.GITHUB_RUN_NUMBER || '?')}`,
  ];
  if (report?.stats) {
    const { expected = 0, unexpected = 0, flaky = 0, skipped = 0, duration = 0 } = report.stats;
    lines.push(`*Total:* ${expected + unexpected + flaky + skipped} | ✅ Passed: ${expected} | ❌ Failed: ${unexpected} | ⚠️ Flaky: ${flaky} | ⏭️ Skipped: ${skipped}`);
    lines.push(`Duration: ${(duration / 1000).toFixed(1)} seconds`);
    const issues = [];
    function visit(suite) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          if (['unexpected', 'flaky'].includes(test.status)) {
            // Only source locations: errors and parameterized titles can contain credentials.
            issues.push(`${test.status === 'flaky' ? '⚠️' : '❌'} ${escapeSlack(spec.file || suite.file || 'unknown')}:${spec.line || '?'} (${escapeSlack(test.projectName || 'default')})`);
          }
        }
      }
      for (const child of suite.suites || []) visit(child);
    }
    for (const suite of report.suites || []) visit(suite);
    if (issues.length) {
      lines.push('*Failed or flaky test locations:*', ...issues.slice(0, 15));
      if (issues.length > 15) lines.push(`…and ${issues.length - 15} more in the report.`);
    }
  } else {
    lines.push(`Test step: ${escapeSlack(env.TEST_OUTCOME || 'not run')} | No JSON report available (setup or execution may have failed).`);
  }
  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  lines.push(`<${runUrl}|Open GitHub run and download Playwright report>`);
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
if (require.main === module) main().catch(() => {
  // Never print fetch errors or webhook URLs.
  console.error('Slack notification failed. Check webhook configuration and availability.');
  process.exitCode = 1;
});
