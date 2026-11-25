import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { relative } from 'node:path';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 15.1 s under a minute, 3 m 47 s from a minute up.
const formatDuration = (ms: number) => {
  const seconds = ms / 1000;
  if (seconds < 59.95) return `${seconds.toFixed(1)} s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h ? `${h} h ` : ""}${m} m ${total % 60} s`;
};

export default class LocalSlackReporter implements Reporter {
  private suite?: Suite;
  private executed = false;

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }

  onTestEnd(_test: TestCase, _result: TestResult) {
    this.executed = true;
  }

  async onEnd(result: FullResult) {
    // Do not send notifications for test discovery or CI (which has its own notification).
    if (process.env.CI || !this.executed || !this.suite) return;
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
      console.warn('Local Slack notification skipped: SLACK_WEBHOOK_URL is not set.');
      return;
    }

    const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
    const issues: string[] = [];
    const tests = this.suite.allTests();
    for (const test of tests) {
      const outcome = test.outcome();
      counts[outcome]++;
      if (outcome === 'unexpected' || outcome === 'flaky') {
        const location = relative(process.cwd(), test.location.file);
        // Titles are static and credential-free (no emails/passwords in test titles).
        const title = test.titlePath().slice(3).join(' › ');
        issues.push(`${outcome === 'flaky' ? '⚠️' : '❌'} ${escape(title)} — ${escape(location)}:${test.location.line}`);
      }
    }
    const status = { passed: '✅ Passed', failed: '❌ Failed', timedout: '⏱️ Timed out', interrupted: '⚠️ Interrupted' }[result.status];
    const lines = [
      `*Playwright Tests — ${status}*`,
      'Project: premiereonline | Trigger: Local (VS Code / CLI)',
      `*Total:* ${tests.length} | ✅ Passed: ${counts.expected} | ❌ Failed: ${counts.unexpected} | ⚠️ Flaky: ${counts.flaky} | ⏭️ Skipped: ${counts.skipped}`,
      `Duration: ${formatDuration(result.duration)}`,
      ...(issues.length ? ['*Failed or flaky tests:*', ...issues.slice(0, 15)] : []),
      ...(issues.length > 15 ? [`…and ${issues.length - 15} more in the local report.`] : []),
      'Reports: local Playwright HTML and Allure.',
    ];

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n'), unfurl_links: false, unfurl_media: false }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Slack rejected notification');
      console.log('Local Slack notification delivered.');
    } catch {
      // Keep the original test result and never print the webhook or response body.
      console.warn('Local Slack notification failed. Check the webhook configuration.');
    }
  }
}
