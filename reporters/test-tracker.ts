import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertVideo, publishLatest, specName } from './evidence-files';

/**
 * Test tracker: a self-contained HTML report (tracker-report/index.html) that shows at a glance which tests
 * passed / failed, points at the exact failing step, gives a probable diagnosis (app bug vs test issue vs
 * environment vs flaky) and embeds the evidence (annotated MP4, screenshots, trace).
 * Opened automatically after local runs (not on CI, not with NO_REPORT_OPEN); on CI it is uploaded as an artifact.
 */

const OUT_DIR = 'tracker-report';

// Visual theme of the report: light | dark | corporate (TRACKER_THEME). The viewer can also switch it in the page.
const THEMES = ['light', 'dark', 'corporate'];
const pickTheme = () => (THEMES.includes(process.env.TRACKER_THEME ?? '') ? (process.env.TRACKER_THEME as string) : 'light');

type Status = 'passed' | 'failed' | 'flaky' | 'skipped';
type Verdict = 'APP_BUG' | 'TEST' | 'ENV' | 'FLAKY' | 'CHECK' | 'UNKNOWN';

interface StepNode {
  title: string;
  ms: number;
  failed: boolean;
  hook: boolean;
  children: StepNode[];
}

interface Diagnosis {
  verdict: Verdict;
  title: string;
  why: string;
  next: string[];
  expected?: string;
  received?: string;
  locator?: string;
}

interface EvidenceFile {
  label: string;
  url: string;
}

interface ApiCall {
  method: string;
  url: string;
  status: number;
  statusText: string;
  ms: number;
  requestBody?: string;
  responseBody?: string;
}

interface TestRecord {
  id: number;
  file: string;
  line: number;
  group: string;
  title: string;
  status: Status;
  timedOut: boolean;
  ms: number;
  attempts: number;
  steps: StepNode[];
  failedPath?: string[];
  failedIn?: 'setup' | 'test';
  failedTop?: { index: number; total: number };
  error?: string;
  specAt?: string;
  pageAt?: string;
  diagnosis?: Diagnosis;
  screenshots: EvidenceFile[];
  videos: EvidenceFile[];
  specVideo?: string;
  apiCalls?: ApiCall[];
  trace?: EvidenceFile;
  rerun: string;
}

const strip = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '');

function buildSteps(steps: TestStep[]): StepNode[] {
  const out: StepNode[] = [];
  for (const step of steps) {
    if (step.category === 'test.step' || step.category === 'hook') {
      const children = buildSteps(step.steps);
      if (step.category === 'hook' && !children.length) continue; // hooks with nothing but fixtures
      out.push({ title: step.title, ms: Math.round(step.duration), failed: !!step.error, hook: step.category === 'hook', children });
    } else {
      out.push(...buildSteps(step.steps)); // Playwright-internal steps (pw:api, expect, fixture): keep their test.steps only
    }
  }
  return out;
}

function failedPath(nodes: StepNode[]): string[] | undefined {
  for (const node of nodes) {
    if (!node.failed) continue;
    return [node.title, ...(failedPath(node.children) ?? [])];
  }
  return undefined;
}

// Specs written without test.step: fall back to the Playwright actions and assertions of the test body.
// Value-bearing actions (fill, type, press, select, evaluate) and fixture noise are left out.
const RAW_SKIP = /^(Fill|Type|Press|Insert text|Select|Set input|Evaluate|Create |Launch |Close |Wait for)/;
function rawSteps(steps: TestStep[]): StepNode[] {
  return steps
    .filter((step) => (step.category === 'pw:api' || step.category === 'expect') && !RAW_SKIP.test(step.title))
    .map((step) => ({ title: step.title, ms: Math.round(step.duration), failed: !!step.error, hook: false, children: [] }));
}

// First stack frame (inside the project, not node_modules) matching the filter, as `file:line`.
function frame(error: TestError | undefined, accept: (path: string) => boolean): string | undefined {
  const stack = strip(error?.stack ?? '');
  for (const line of stack.split('\n')) {
    const match = /\(?([A-Za-z]:[\\/][^():]+|\/[^():]+):(\d+):\d+\)?\s*$/.exec(line.trim());
    if (!match) continue;
    const path = match[1];
    if (path.includes('node_modules') || !accept(path.replace(/\\/g, '/'))) continue;
    return `${relative(process.cwd(), path).replace(/\\/g, '/')}:${match[2]}`;
  }
  return undefined;
}

// ───────────────────────── Diagnosis: where does the failure probably come from? ─────────────────────────

function diagnose(message: string, flaky: boolean, timedOut: boolean, ctx: { stepTitle?: string; testTitle?: string } = {}): Diagnosis {
  const text = strip(message);
  const pick = (re: RegExp) => re.exec(text)?.[1]?.trim();
  const expected = pick(/Expected(?: string| pattern| substring)?:\s*(.+)/);
  const received = pick(/Received(?: string)?:\s*(.+)/);
  const locator = pick(/Locator:\s*(.+)/);
  const matcher = /expect\([^)]*\)\.(not\.)?(\w+)\(/.exec(text);
  const negated = !!matcher?.[1];
  const name = matcher?.[2] ?? '';
  // "element(s) not found" is the assertion failing on a missing element. The call log of EVERY expect also
  // contains "waiting for getBy...", so that phrase must not be used here. Actions fail with "locator.x: Timeout".
  const notFound = /element\(s\) not found/i.test(text);
  const actionTimeout = /locator\.\w+: Timeout/i.test(text);

  if (flaky) {
    return {
      verdict: 'FLAKY',
      title: 'Flaky: failed, then passed on retry',
      why: 'The same test both failed and passed, so the app and the test disagree only sometimes (timing, shared state, slow render).',
      next: [
        'Look at the failed attempt: which step stalled, and was the page still loading?',
        'Measure it: npx playwright test <file> --repeat-each=10',
        'Replace guessed waits with an assertion of the state that must come first.',
      ],
      expected, received, locator,
    };
  }
  if (/net::ERR_|ECONNREFUSED|ENOTFOUND|getaddrinfo|ERR_NAME_NOT_RESOLVED|socket hang up|page\.goto: (Timeout|Navigation)/i.test(text)) {
    return {
      verdict: 'ENV',
      title: 'Environment: the app could not be reached',
      why: 'The browser failed to load the page (network / DNS / server down / wrong URL), so this is probably not a product bug and not a test bug.',
      next: ['Open BASE_URL in a browser: is the stand up?', 'Check BASE_URL in .env.local or the CI variable.', 'Re-run once the stand is reachable.'],
      expected, received, locator,
    };
  }
  if (/strict mode violation/i.test(text)) {
    return {
      verdict: 'TEST',
      title: 'Test issue: the locator matches several elements',
      why: 'The selector is ambiguous, so Playwright refuses to guess. The page probably changed (a duplicate element) or the locator is too broad.',
      next: ['Make the locator unique in the page object (scope it from the form, or use another data-testid).', 'If two identical elements are a real defect, report it as a UI bug.'],
      expected, received, locator,
    };
  }
  if (/TypeError|ReferenceError|SyntaxError|is not a function|Cannot read propert|is not defined/.test(text)) {
    return {
      verdict: 'TEST',
      title: 'Test issue: error in the test code',
      why: 'A JavaScript error was thrown inside the test or a page object. It is not an assertion about the app.',
      next: ['Open the "Spec" / "Page object" line above and fix the code.', 'Run npm run typecheck.'],
      expected, received, locator,
    };
  }
  if (timedOut && /Test timeout of/i.test(text)) {
    return {
      verdict: 'ENV',
      title: 'Timeout: the app is too slow or a step is stuck',
      why: 'The whole test exceeded its time limit. Either the stand responded very slowly or the test waited for something that never happens.',
      next: ['Watch the video: where does it stop moving?', 'Check the stand response time.', 'If the app is healthy, the step that waits is probably wrong (test issue).'],
      expected, received, locator,
    };
  }
  if (name === 'toBeHidden' || (name === 'toBeVisible' && negated)) {
    return {
      verdict: 'APP_BUG',
      title: 'Probable app bug: something is shown that should not be',
      why: 'An element that must be absent is visible (for example an error message, or the user still looks logged in). The app behaves differently from the expectation.',
      next: ['Open the screenshot: is the unexpected element really on the page?', 'If this is intended new behaviour, update the test. Otherwise report a bug.'],
      expected, received, locator,
    };
  }
  if (expected !== undefined && received !== undefined && !notFound) {
    return {
      verdict: 'APP_BUG',
      title: 'Probable app bug: the page shows a different value',
      why: 'The element was found, but its text / value / attribute differs from the expectation. Either the app regressed or its copy was changed on purpose.',
      next: [
        'Compare Expected and Received below with the data file (Data/*.json).',
        'Changed on purpose? Update the JSON (test data issue). Not intended? It is a real bug: report it.',
      ],
      expected, received, locator,
    };
  }
  // Negative scenario: the test does something wrong on purpose and expects the app to reject it with a message.
  // If that message is missing, the app most likely accepted the invalid input: a bug until proven otherwise.
  const negativeTest = /validation|negative|invalid|error|unregistered|duplicate|reject|forbidden|unauthori[sz]ed/i.test(ctx.testTitle ?? '');
  const errorStep = /error|validation|invalid|warning|message/i.test(ctx.stepTitle ?? '');
  if (negativeTest && errorStep && (notFound || actionTimeout || name === 'toBeVisible')) {
    return {
      verdict: 'APP_BUG',
      title: 'Probable app bug: the expected error message did not appear',
      why: 'This is a negative scenario: the test does something wrong on purpose and expects the app to reject it with a message. The message is missing, so the app probably accepted the invalid input (validation is not working).',
      next: [
        'Open the screenshot: did the app accept the input (new page, logged in, success state)?',
        'If yes, this is a real bug (missing validation): report it and do not change the test.',
        'If the form is still shown and only the message element has another test id or container, fix the locator (TEST ISSUE).',
      ],
      expected, received: received ?? (notFound ? '(element not found)' : undefined), locator,
    };
  }
  if (notFound || actionTimeout || name === 'toBeVisible' || name === 'toBeEnabled' || name === 'toBeAttached') {
    return {
      verdict: 'CHECK',
      title: 'Check the screenshot: element missing or not usable',
      why: 'The element was not found / not visible in time. It is either a stale locator (test issue) or the page is not in the expected state (app bug or environment).',
      next: [
        'Right page, element missing? The data-testid or markup changed: fix the locator in the page object (TEST ISSUE).',
        'Wrong page, blank page or an error screen? Probably an APP BUG or an environment problem.',
        'Look at the video to see what the page did before this step.',
      ],
      expected, received: received ?? (notFound ? '(element not found)' : undefined), locator,
    };
  }
  return {
    verdict: 'UNKNOWN',
    title: 'Unclassified failure',
    why: 'The error does not match a known pattern.',
    next: ['Read the raw error below.', 'Watch the video and open the trace for the full timeline.'],
    expected, received, locator,
  };
}

// ───────────────────────── Reporter ─────────────────────────

export default class TestTrackerReporter implements Reporter {
  private suite?: Suite;
  private config?: FullConfig;
  private startedAt = new Date();
  private executed = false;

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
    this.startedAt = new Date();
  }

  onTestEnd() {
    this.executed = true;
  }

  async onEnd(result: FullResult) {
    if (!this.suite || !this.executed) return; // `--list` or nothing ran: keep the previous report
    const out = resolve(process.cwd(), OUT_DIR);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, 'evidence'), { recursive: true });

    const records: TestRecord[] = [];
    const groups = new Map<string, TestRecord[]>();
    const executedSpecs = new Set<string>();
    const cases = this.suite.allTests().sort((a, b) => a.location.file.localeCompare(b.location.file) || a.location.line - b.location.line);
    for (const [id, test] of cases.entries()) {
      const spec = specName(relative(process.cwd(), test.location.file).replace(/\\/g, '/'));
      const group = groups.get(spec) ?? [];
      const record = await this.record(test, id, out, spec + '.tc' + (group.length + 1));
      group.push(record);
      groups.set(spec, group);
      records.push(record);
      if (test.results.some(r => r.status !== 'skipped')) executedSpecs.add(spec);
    }
    for (const [spec, group] of groups) {
      if (!executedSpecs.has(spec)) continue;
      try {
        const video = await publishLatest(spec, group, out);
        for (const record of group) record.specVideo = video;
      } catch (error) {
        console.warn('Could not publish evidence for ' + spec + ':', error);
      }
    }
    const order = { failed: 0, flaky: 1, passed: 2, skipped: 3 } as const;
    records.sort((a, b) => order[a.status] - order[b.status] || a.id - b.id);

    const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
    for (const r of records) counts[r.status]++;

    const baseURL = (this.config?.projects[0]?.use as { baseURL?: string } | undefined)?.baseURL ?? '';
    const data = {
      title: 'Test report',
      startedAt: this.startedAt.toISOString(),
      durationMs: Math.round(result.duration),
      runStatus: result.status,
      baseURL,
      evidenceMode: process.env.EVIDENCE_MODE === '1',
      ci: process.env.CI
        ? {
            run: process.env.GITHUB_RUN_NUMBER ?? '',
            branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '',
            sha: (process.env.GITHUB_SHA ?? '').slice(0, 7),
            trigger: process.env.GITHUB_EVENT_NAME ?? '',
          }
        : undefined,
      counts,
      tests: records,
    };
    const indexFile = join(out, 'index.html');
    writeFileSync(indexFile, renderHtml(data, pickTheme()));
    console.log(`\nTest report: ${OUT_DIR}/index.html  (${counts.failed} failed, ${counts.flaky} flaky, ${counts.passed} passed)`);
    console.log(`Open: ${pathToFileURL(indexFile).href}`);

    if (!process.env.CI && !process.env.NO_REPORT_OPEN) openInBrowser(indexFile);
  }

  private async record(test: TestCase, id: number, out: string, prefix: string): Promise<TestRecord> {
    const outcome = test.outcome();
    const status: Status = outcome === 'expected' ? 'passed' : outcome === 'unexpected' ? 'failed' : outcome === 'flaky' ? 'flaky' : 'skipped';
    const results = test.results;
    // The attempt to explain: the last attempt that did not pass (for flaky: the failed one), else the last one.
    const shown: TestResult | undefined = [...results].reverse().find((r) => r.status !== 'passed' && r.status !== 'skipped') ?? results[results.length - 1];

    const file = relative(process.cwd(), test.location.file).replace(/\\/g, '/');
    const titles = test.titlePath().slice(3);
    const record: TestRecord = {
      id,
      file,
      line: test.location.line,
      group: titles.slice(0, -1).join(' › '),
      title: titles[titles.length - 1] ?? test.title,
      status,
      timedOut: results.some((r) => r.status === 'timedOut'),
      ms: Math.round(results.reduce((sum, r) => sum + r.duration, 0)),
      attempts: results.length,
      steps: shown ? buildSteps(shown.steps) : [],
      screenshots: [],
      videos: [],
      rerun: `${file}:${test.location.line}`,
    };

    if (shown) {
      if (!record.steps.some((s) => !s.hook)) record.steps.push(...rawSteps(shown.steps));
      // API calls recorded by fixtures/api.ts
      for (const a of shown.attachments) {
        if (!/^api-call-[0-9]+$/.test(a.name) || a.contentType !== 'application/json') continue;
        try {
          const text = a.body ? a.body.toString('utf8') : readFileSync(a.path as string, 'utf8');
          (record.apiCalls ??= []).push(JSON.parse(text) as ApiCall);
        } catch {
          // unreadable attachment: skip
        }
      }
    }

    if (shown && (status === 'failed' || status === 'flaky')) {
      const error = shown.errors[0] ?? shown.error;
      record.error = strip(error?.message ?? 'No error message').slice(0, 3000);
      record.failedPath = failedPath(record.steps);
      const topLevel = record.steps.filter((s) => !s.hook);
      const failedTop = record.steps.find((s) => s.failed);
      record.failedIn = failedTop?.hook ? 'setup' : 'test';
      if (failedTop && !failedTop.hook) record.failedTop = { index: topLevel.indexOf(failedTop) + 1, total: topLevel.length };
      record.specAt = frame(error, (p) => p.includes('/tests/'));
      record.pageAt = frame(error, (p) => p.includes('/pages/') && !p.endsWith('/BasePage.ts')) ?? frame(error, (p) => p.endsWith('/BasePage.ts'));
      record.diagnosis = diagnose(record.error, status === 'flaky', record.timedOut, {
        stepTitle: record.failedPath?.[record.failedPath.length - 1],
        testTitle: record.title,
      });
    }

    // Evidence: copy attachments next to the report so it stays viewable after test-results is cleaned.
    if (shown) {
      const hasMp4 = shown.attachments.some((a) => a.contentType === 'video/mp4');
      const hasAnnotatedShot = shown.attachments.some((a) => a.name === 'evidence-failure');
      const images = shown.attachments.filter(a => a.contentType.startsWith('image/') && !(a.name === 'screenshot' && hasAnnotatedShot));
      let imageNumber = 0;
      for (const a of shown.attachments) {
        if (a.contentType === 'video/webm' && hasMp4) continue; // the annotated MP4 supersedes the raw WebM
        if (a.name === 'screenshot' && hasAnnotatedShot) continue; // ...and the annotated shot Playwright's plain one
        // Only what the report shows: images, videos and the trace (skip error-context.md and the like).
        if (!(a.contentType.startsWith('image/') || a.contentType.startsWith('video/') || a.name === 'trace')) continue;
        const isImage = a.contentType.startsWith('image/');
        const isVideo = a.contentType.startsWith('video/');
        if (isVideo && record.videos.length) continue;
        const ext = a.path ? extname(a.path) : a.contentType.includes('jpeg') ? '.jpg' : isImage ? '.png' : '';
        let fileName = isImage
          ? prefix + (images.length > 1 ? '.' + ++imageNumber : '') + '.screenshot' + (ext || '.png')
          : isVideo ? prefix + '.video' + (a.contentType === 'video/mp4' ? '.mp4' : '.webm') : prefix + '.trace.zip';
        const dest = join(out, 'evidence', fileName);
        try {
          if (a.path && existsSync(a.path)) copyFileSync(a.path, dest);
          else if (a.body) writeFileSync(dest, a.body);
          else continue;
        } catch {
          continue;
        }
        if (a.contentType === 'video/webm') {
          const mp4Name = prefix + '.video.mp4';
          if (await convertVideo(dest, join(out, 'evidence', mp4Name))) {
            rmSync(dest);
            fileName = mp4Name;
          }
        }
        const entry = { label: a.name, url: `evidence/${fileName}` };
        if (a.contentType.startsWith('image/')) record.screenshots.push(entry);
        else if (fileName.endsWith('.mp4')) record.videos.unshift({ ...entry, label: 'Annotated video (MP4)' });
        else if (a.contentType === 'video/webm') record.videos.push({ ...entry, label: 'Raw video (WebM)' });
        else if (a.name === 'trace') record.trace = { ...entry, label: 'Playwright trace' };
      }
      // The annotated MP4 supersedes the raw WebM, the annotated failure shot supersedes Playwright's plain one.
      if (record.videos.some((v) => v.url.endsWith('.mp4'))) record.videos = record.videos.filter((v) => v.url.endsWith('.mp4'));
      if (record.screenshots.some((s) => s.label === 'evidence-failure')) record.screenshots = record.screenshots.filter((s) => s.label !== 'screenshot');
      record.screenshots.sort((a, b) => Number(b.label === 'evidence-failure') - Number(a.label === 'evidence-failure'));
    }
    return record;
  }
}

function openInBrowser(file: string) {
  try {
    const [command, args] =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
    spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // opening is a convenience only
  }
}

// ───────────────────────── HTML ─────────────────────────

function renderHtml(data: unknown, theme: string): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test report</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="in" id="top"></div></header>
<main id="app"></main>
<div id="lightbox" hidden><img alt=""></div>
<script id="data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = `
:root,[data-theme="light"]{--bg:#f6f8fa;--panel:#ffffff;--panel2:#f6f8fa;--line:#d0d7de;--text:#1f2328;--muted:#656d76;--accent:#0969da;--green:#1a7f37;--green-bg:#dafbe1;--red:#cf222e;--red-bg:#ffebe9;--amber:#9a6700;--amber-bg:#fff8c5;--gray:#6e7781;--gray-bg:#eaeef2;--hdr-bg:#ffffff;--hdr-text:#1f2328;--radius:8px;--shadow:0 1px 2px rgba(31,35,40,.06)}
[data-theme="dark"]{--bg:#0d1117;--panel:#161b22;--panel2:#1c2128;--line:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--green-bg:#12261a;--red:#f85149;--red-bg:#2d1519;--amber:#d29922;--amber-bg:#2a2210;--gray:#8b949e;--gray-bg:#21262d;--hdr-bg:#161b22;--hdr-text:#e6edf3;--radius:8px;--shadow:none}
[data-theme="corporate"]{--bg:#eef1f5;--panel:#ffffff;--panel2:#f4f6f9;--line:#d5dbe3;--text:#1b2a3a;--muted:#5d6b7a;--accent:#1f4e8c;--green:#1d7a46;--green-bg:#e3f4ea;--red:#b42318;--red-bg:#fdecea;--amber:#9a5b00;--amber-bg:#fff4dc;--gray:#5d6b7a;--gray-bg:#e6eaf0;--hdr-bg:#14284b;--hdr-text:#ffffff;--radius:4px;--shadow:0 1px 3px rgba(20,40,75,.12)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.top{background:var(--hdr-bg);color:var(--hdr-text);border-bottom:1px solid var(--line)}
.top .in{max-width:1180px;margin:0 auto;padding:14px 20px;display:flex;flex-wrap:wrap;gap:6px 24px;align-items:center}
h1{margin:0;font-size:18px;font-weight:600}
.meta{display:flex;flex-wrap:wrap;gap:2px 18px;font-size:13px;opacity:.9}
.meta b{font-weight:600}
.meta a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.themes{margin-left:auto;display:flex;gap:2px;border:1px solid var(--line);border-radius:var(--radius);padding:2px}
.themes button{cursor:pointer;border:0;background:transparent;color:inherit;opacity:.75;padding:3px 10px;border-radius:calc(var(--radius) - 2px);font:inherit;font-size:12px}
.themes button.on{background:var(--accent);color:#fff;opacity:1}
main{max-width:1180px;margin:0 auto;padding:20px 20px 60px}
.banner{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;padding:12px 16px;margin-bottom:16px;border:1px solid var(--line);border-left-width:4px;border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow)}
.banner .big{font-size:16px;font-weight:600}
.banner.ok{border-left-color:var(--green)}.banner.ok .big{color:var(--green)}
.banner.bad{border-left-color:var(--red)}.banner.bad .big{color:var(--red)}
.banner .hint{color:var(--muted)}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:16px}
.chart{display:flex;align-items:center;gap:18px;padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow)}
.donut{width:104px;height:104px;flex:none}
.donut .dn{font-size:8px;font-weight:600;fill:var(--text)}
.chart h3{margin:0 0 6px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.chart ul{list-style:none;margin:0;padding:0;font-size:13px}
.chart li{display:flex;align-items:center;gap:8px;margin:2px 0}
.chart li i{width:10px;height:10px;border-radius:2px;display:inline-block;flex:none}
.chart li b{margin-left:auto;padding-left:14px;font-variant-numeric:tabular-nums}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.pill{cursor:pointer;border:1px solid var(--line);background:var(--panel);color:var(--text);padding:5px 12px;border-radius:99px;font:inherit;font-size:13px;text-transform:capitalize}
.pill:hover{border-color:var(--accent)}
.pill.on{background:var(--accent);border-color:var(--accent);color:#fff}
.search{flex:1;min-width:200px;padding:6px 12px;border-radius:var(--radius);border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit}
.search:focus,.themes button:focus-visible,.pill:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.test{margin-bottom:8px;border:1px solid var(--line);border-left-width:4px;border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow);overflow:hidden}
.test.failed{border-left-color:var(--red)}.test.flaky{border-left-color:var(--amber)}.test.passed{border-left-color:var(--green)}.test.skipped{border-left-color:var(--gray)}
.test>summary{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:10px 14px;cursor:pointer;list-style:none}
.test>summary::-webkit-details-marker{display:none}
.test>summary:hover{background:var(--panel2)}
.badge{min-width:54px;text-align:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.06em}
.badge.passed{background:var(--green-bg);color:var(--green)}.badge.failed{background:var(--red-bg);color:var(--red)}.badge.flaky{background:var(--amber-bg);color:var(--amber)}.badge.skipped{background:var(--gray-bg);color:var(--gray)}
.ttl{flex:1;min-width:220px}.ttl small{display:block;color:var(--muted);font-size:12px}
.dur{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.chip{padding:1px 9px;border-radius:99px;font-size:11px;font-weight:600;border:1px solid}
.chip.APP_BUG{color:var(--red);border-color:var(--red)}.chip.TEST,.chip.CHECK{color:var(--accent);border-color:var(--accent)}
.chip.ENV,.chip.FLAKY{color:var(--amber);border-color:var(--amber)}.chip.UNKNOWN{color:var(--gray);border-color:var(--gray)}
.body{padding:2px 16px 16px;border-top:1px solid var(--line)}
.at{margin:14px 0;padding:12px 14px;border-radius:var(--radius);border:1px solid var(--red);border-left-width:4px;background:var(--red-bg)}
.at .k{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--red);text-transform:uppercase}
.at .path{margin-top:6px;font-size:14px;font-weight:600}.at .path span{color:var(--muted);margin:0 6px;font-weight:400}.at .path b{font-weight:700}
.at .loc{margin-top:6px;color:var(--muted);font:12px/1.5 ui-monospace,Consolas,monospace}
.diag{margin:12px 0;padding:12px 14px;border-radius:var(--radius);border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--panel2)}
.diag .k{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--accent);text-transform:uppercase}
.diag h4{margin:6px 0 2px;font-size:14px}.diag p{margin:2px 0 8px}.diag ul{margin:6px 0 0;padding-left:20px}.diag li{margin:2px 0}
.diff{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:6px 0;font:12px/1.45 ui-monospace,Consolas,monospace}
.diff .e{color:var(--green)}.diff .r{color:var(--red)}.diff .v{word-break:break-word}
.steps{margin:12px 0}.steps .k,.ev .k{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:6px}
.steps ol{list-style:none;margin:0;padding-left:0}.steps ol ol{padding-left:20px;border-left:1px solid var(--line);margin-left:8px}
.st{display:flex;gap:8px;align-items:baseline;padding:3px 8px;border-radius:4px}
.st .ic{width:16px;text-align:center;font-weight:700}.st .ms{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}
.st.ok .ic{color:var(--green)}.st.hook{color:var(--muted)}
.st.bad{background:var(--red-bg)}.st.bad .ic{color:var(--red)}
.st.here{font-weight:600;box-shadow:inset 3px 0 0 var(--red)}
.st.here::after{content:"◀ failed here";margin-left:8px;color:var(--red);font-size:11px;font-weight:700}
.ev{margin:12px 0}
.evg{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;align-items:start}
.evg figure{margin:0}.evg figcaption{font-size:12px;color:var(--muted);margin-top:4px}
.evg img,.evg video{display:block;width:100%;border-radius:var(--radius);border:1px solid var(--line);background:#000;cursor:zoom-in}
.evg video{cursor:default}.vid{grid-column:1/-1}.vid video{max-height:520px}
.tools2{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.btn{cursor:pointer;border:1px solid var(--accent);background:transparent;color:var(--accent);padding:3px 10px;border-radius:var(--radius);font:inherit;font-size:12px;font-weight:600;text-decoration:none}
.btn:hover{background:var(--accent);color:#fff}
code,pre{font:12px/1.5 ui-monospace,Consolas,monospace}
pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;padding:10px 12px;border-radius:var(--radius);background:var(--panel2);border:1px solid var(--line);max-height:340px;overflow:auto}
details.raw>summary{cursor:pointer;color:var(--muted);font-size:13px}
.foot{margin-top:32px;text-align:center;color:var(--muted);font-size:12px}
.empty{padding:24px;text-align:center;color:var(--muted)}
#lightbox{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out}
#lightbox[hidden]{display:none}#lightbox img{max-width:94vw;max-height:94vh;border-radius:4px}
.call{margin:6px 0;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel2)}
.call>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:8px 12px}
.call>summary::-webkit-details-marker{display:none}
.call .u{flex:1;min-width:200px;font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--muted);word-break:break-all}
.call .cb{padding:0 12px 12px}.k2{margin:8px 0 2px;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
.chip.s2{color:var(--green);border-color:var(--green)}.chip.s3{color:var(--accent);border-color:var(--accent)}.chip.s4{color:var(--amber);border-color:var(--amber)}.chip.s5{color:var(--red);border-color:var(--red)}
.note{margin:12px 0;padding:10px 14px;border-radius:var(--radius);border:1px dashed var(--line);color:var(--muted);font-size:13px}
`;

const JS = `
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var app=document.getElementById('app');
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmt(ms){
  if(ms<10)return '<0.01 s';
  if(ms<1000)return (ms/1000).toFixed(2)+' s';
  if(ms<59950)return (ms/1000).toFixed(1)+' s';
  var t=Math.round(ms/1000),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
  return (h?h+' h ':'')+m+' m '+s+' s';
}
var LABEL={passed:'PASS',failed:'FAIL',flaky:'FLAKY',skipped:'SKIP'};
var VERDICT={APP_BUG:'Probable app bug',TEST:'Test issue',ENV:'Environment',FLAKY:'Flaky',CHECK:'Check screenshot',UNKNOWN:'Unclassified'};
var c=D.counts,total=c.passed+c.failed+c.flaky+c.skipped;

function steps(list,failedPath,depth){
  if(!list.length)return '';
  var h='<ol>';
  list.forEach(function(s){
    var here=s.failed&&!s.children.some(function(x){return x.failed});
    var cls='st '+(s.failed?'bad':'ok')+(s.hook?' hook':'')+(here?' here':'');
    h+='<li><div class="'+cls+'"><span class="ic">'+(s.failed?'\\u2717':'\\u2713')+'</span><span>'+esc(s.title)+'</span><span class="ms">'+fmt(s.ms)+'</span></div>'+steps(s.children,failedPath,depth+1)+'</li>';
  });
  return h+'</ol>';
}

function apiCalls(t){
  if(!t.apiCalls||!t.apiCalls.length)return '';
  var h='<div class="ev"><div class="k">API calls</div>';
  t.apiCalls.forEach(function(c){
    var cls='s'+String(c.status).charAt(0);
    h+='<details class="call"><summary><span class="chip '+cls+'">'+esc(c.status)+'</span> <b>'+esc(c.method)+'</b> <span class="u">'+esc(c.url)+'</span><span class="dur">'+fmt(c.ms)+'</span></summary><div class="cb">';
    if(c.requestBody)h+='<div class="k2">Request body</div><pre>'+esc(c.requestBody)+'</pre>';
    if(c.responseBody)h+='<div class="k2">Response body</div><pre>'+esc(c.responseBody)+'</pre>';
    if(!c.requestBody&&!c.responseBody)h+='<div class="k2">No body</div>';
    h+='</div></details>';
  });
  return h+'</div>';
}

function evidence(t){
  if(!t.videos.length&&!t.screenshots.length&&!t.trace&&t.status!=='skipped')return '<div class="note">'+(t.apiCalls&&t.apiCalls.length?'Video and screenshots: unavailable. This is a backend API test, it does not open a browser. Its requests and responses are listed above.':'Video and screenshots: unavailable. This test did not open a browser.')+'</div>';
  var h='';
  if(t.videos.length||t.screenshots.length||t.trace){
    h+='<div class="ev"><div class="k">Evidence</div><div class="evg">';
    t.videos.forEach(function(v){h+='<figure class="vid"><video controls preload="metadata" src="'+esc(v.url)+'"></video><figcaption>'+esc(v.label)+' · <a class="btn" href="'+esc(v.url)+'" download>Download video</a></figcaption></figure>'});
    t.screenshots.forEach(function(s){
      var name=s.label==='screenshot'?'Playwright failure screenshot':s.label==='evidence-failure'?'Annotated failure screenshot':s.label.replace('evidence-','Checkpoint ');
      h+='<figure><img loading="lazy" data-zoom src="'+esc(s.url)+'" alt="'+esc(name)+'"><figcaption>'+esc(name)+' · <a class="btn" href="'+esc(s.url)+'" download>Download screenshot</a></figcaption></figure>';
    });
    h+='</div>';
    if(t.trace)h+='<div class="tools2"><a class="btn" href="'+esc(t.trace.url)+'" download>Download trace</a><span class="btn" data-copy="npx playwright show-trace '+esc('tracker-report/'+t.trace.url)+'">Copy show-trace command</span></div>';
    h+='</div>';
  }
  return h;
}

function card(t){
  var open=t.status==='failed'||t.status==='flaky';
  var h='<details class="test '+t.status+'" data-status="'+t.status+'" data-q="'+esc((t.group+' '+t.title+' '+t.file).toLowerCase())+'"'+(open?' open':'')+'><summary>';
  h+='<span class="badge '+t.status+'">'+LABEL[t.status]+'</span><span class="ttl">'+esc(t.title)+'<small>'+esc((t.group?t.group+'  \\u00b7  ':'')+t.file+':'+t.line)+'</small></span>';
  if(t.diagnosis)h+='<span class="chip '+t.diagnosis.verdict+'">'+VERDICT[t.diagnosis.verdict]+'</span>';
  h+='<span class="dur">'+fmt(t.ms)+(t.attempts>1?'  \\u00b7  '+t.attempts+' attempts':'')+'</span></summary><div class="body">';
  if(t.failedPath||t.error){
    var where=t.failedIn==='setup'?'Precondition (before the test body)':(t.failedTop?'Step '+t.failedTop.index+' of '+t.failedTop.total:'Test body');
    h+='<div class="at"><div class="k">'+(t.status==='flaky'?'Failed attempt stopped at':'Failed at')+' \\u2014 '+esc(where)+'</div>';
    if(t.failedPath)h+='<div class="path">'+t.failedPath.map(function(p,i){return i===t.failedPath.length-1?'<b>'+esc(p)+'</b>':esc(p)}).join('<span>\\u203a</span>')+'</div>';
    var loc=[];if(t.specAt)loc.push('Spec: '+t.specAt);if(t.pageAt)loc.push('Page object: '+t.pageAt);
    if(loc.length)h+='<div class="loc">'+esc(loc.join('   |   '))+'</div>';
    h+='</div>';
  }
  if(t.diagnosis){
    var d=t.diagnosis;
    h+='<div class="diag"><div class="k">Diagnosis \\u2014 probable cause</div><h4>'+esc(d.title)+'</h4><p>'+esc(d.why)+'</p>';
    if(d.expected!==undefined||d.received!==undefined){
      h+='<div class="diff">';
      if(d.expected!==undefined)h+='<span class="e">Expected</span><span class="v">'+esc(d.expected)+'</span>';
      if(d.received!==undefined)h+='<span class="r">Received</span><span class="v">'+esc(d.received)+'</span>';
      h+='</div>';
    }
    if(d.locator)h+='<div class="loc" style="color:var(--muted);font:12px ui-monospace,Consolas,monospace">Locator: '+esc(d.locator)+'</div>';
    h+='<ul>'+d.next.map(function(n){return '<li>'+esc(n)+'</li>'}).join('')+'</ul>';
    h+='<div class="tools2"><span class="btn" data-copy="npx playwright test '+esc(t.rerun)+'">Copy re-run command</span><span class="btn" data-copy="npm run test:evidence -- '+esc(t.rerun)+'">Copy evidence-mode command</span></div></div>';
  }
  h+=apiCalls(t);h+=evidence(t);
  if(t.steps.length)h+='<div class="steps"><div class="k">Step timeline</div>'+steps(t.steps,t.failedPath,0)+'</div>';
  if(t.error)h+='<details class="raw"><summary>Raw error</summary><pre>'+esc(t.error)+'</pre></details>';
  return h+'</div></details>';
}

var kinds=[['passed','Passed','var(--green)'],['failed','Failed','var(--red)'],['flaky','Flaky','var(--amber)'],['skipped','Skipped','var(--gray)']];
function donut(title,totalN,counts){
  var r=15.9155,acc=0;
  var svg='<svg viewBox="0 0 42 42" class="donut" role="img" aria-label="'+esc(title)+'"><circle cx="21" cy="21" r="'+r+'" fill="none" style="stroke:var(--gray-bg)" stroke-width="5"/>';
  kinds.forEach(function(k){
    var n=counts[k[0]]||0;if(!n||!totalN)return;
    var p=n/totalN*100;
    svg+='<circle cx="21" cy="21" r="'+r+'" fill="none" style="stroke:'+k[2]+'" stroke-width="5" pathLength="100" stroke-dasharray="'+p+' '+(100-p)+'" stroke-dashoffset="'+(25-acc)+'"/>';
    acc+=p;
  });
  svg+='<text x="21" y="23.5" text-anchor="middle" class="dn">'+totalN+'</text></svg>';
  var li=kinds.filter(function(k){return k[0]==='passed'||k[0]==='failed'||(counts[k[0]]||0)>0}).map(function(k){return '<li><i style="background:'+k[2]+'"></i>'+k[1]+'<b>'+(counts[k[0]]||0)+'</b></li>'}).join('');
  return '<div class="chart">'+svg+'<div><h3>'+esc(title)+'</h3><ul>'+li+'</ul></div></div>';
}
var specStat={};
D.tests.forEach(function(t){var s=specStat[t.file]||(specStat[t.file]={failed:0,flaky:0,passed:0});if(t.status==='failed')s.failed++;else if(t.status==='flaky')s.flaky++;else if(t.status==='passed')s.passed++});
var specCounts={passed:0,failed:0,flaky:0,skipped:0};
Object.keys(specStat).forEach(function(f){var s=specStat[f];specCounts[s.failed?'failed':s.flaky?'flaky':s.passed?'passed':'skipped']++});
var stepTotal=0,stepFailed=0;
function walkSteps(list){list.forEach(function(s){if(!s.hook){stepTotal++;if(s.failed&&!s.children.some(function(x){return x.failed}))stepFailed++}walkSteps(s.children)})}
D.tests.forEach(function(t){walkSteps(t.steps)});

var banner=c.failed>0
 ?'<div class="banner bad"><span class="big">'+c.failed+' test'+(c.failed>1?'s':'')+' failed</span><span class="hint">Failures are listed first. Each one points at the failing step and suggests where the problem is.</span></div>'
 :c.flaky>0
 ?'<div class="banner ok"><span class="big">All passed, '+c.flaky+' flaky</span><span class="hint">Flaky tests failed at first and passed on retry.</span></div>'
 :'<div class="banner ok"><span class="big">All tests passed</span></div>';

var started=new Date(D.startedAt);
var meta='<span>Started <b>'+esc(started.toLocaleString())+'</b></span><span>Duration <b>'+fmt(D.durationMs)+'</b></span>'+(String(D.baseURL).indexOf('http')===0?'<span>Project <b><a href="'+esc(D.baseURL)+'" target="_blank" rel="noopener">'+esc(D.baseURL)+'</a></b></span>':'')+(D.evidenceMode?'<span><b>Evidence mode</b></span>':'')+(D.ci?'<span>CI run <b>#'+esc(D.ci.run)+'</b> '+esc(D.ci.branch)+', '+esc(D.ci.trigger)+(D.ci.sha?', '+esc(D.ci.sha):'')+'</span>':'');
var themes=[['light','Light'],['dark','Dark'],['corporate','Corporate']];
var root=document.documentElement;
try{var savedTheme=localStorage.getItem('tracker-theme');if(savedTheme&&themes.some(function(x){return x[0]===savedTheme}))root.setAttribute('data-theme',savedTheme)}catch(e){}
var switcher='<div class="themes">'+themes.map(function(x){return '<button type="button" data-theme-btn="'+x[0]+'"'+(root.getAttribute('data-theme')===x[0]?' class="on"':'')+'>'+x[1]+'</button>'}).join('')+'</div>';
document.getElementById('top').innerHTML='<h1>'+esc(D.title)+'</h1><div class="meta">'+meta+'</div>'+switcher;
document.querySelectorAll('[data-theme-btn]').forEach(function(b){b.addEventListener('click',function(){
  root.setAttribute('data-theme',b.dataset.themeBtn);
  document.querySelectorAll('[data-theme-btn]').forEach(function(x){x.classList.toggle('on',x===b)});
  try{localStorage.setItem('tracker-theme',b.dataset.themeBtn)}catch(e){}
})});

var html=banner;
html+='<div class="charts">'+donut('Specs',Object.keys(specStat).length,specCounts)+donut('Tests',total,c)+donut('Steps',stepTotal,{passed:stepTotal-stepFailed,failed:stepFailed})+'</div>';
html+='<div class="tools">'+['all','failed','flaky','passed','skipped'].map(function(f){var n=f==='all'?total:c[f];return '<button class="pill'+(f==='all'?' on':'')+'" data-filter="'+f+'">'+f+' '+n+'</button>'}).join('')+'<input class="search" type="search" placeholder="Search tests and files ( / )" aria-label="Search tests"></div>';
html+='<div id="list">'+D.tests.map(card).join('')+'</div>';
if(!D.tests.length)html+='<div class="empty">No tests in this run.</div>';
html+='<div class="foot">Keys: N / P next / previous failure, / search, click a screenshot to enlarge</div>';
app.innerHTML=html;

var filter='all',query='';
function apply(){
  var any=false;
  app.querySelectorAll('.test').forEach(function(el){
    var ok=(filter==='all'||el.dataset.status===filter)&&(!query||el.dataset.q.indexOf(query)>-1);
    el.style.display=ok?'':'none';if(ok)any=true;
  });
}
app.querySelectorAll('[data-filter]').forEach(function(b){b.addEventListener('click',function(){
  filter=b.dataset.filter;app.querySelectorAll('[data-filter]').forEach(function(x){x.classList.toggle('on',x===b)});apply();
})});
var search=app.querySelector('.search');
search.addEventListener('input',function(){query=search.value.trim().toLowerCase();apply()});

var lb=document.getElementById('lightbox');
document.addEventListener('click',function(e){
  var img=e.target.closest&&e.target.closest('img[data-zoom]');
  if(img){lb.querySelector('img').src=img.src;lb.hidden=false;return}
  if(!lb.hidden&&e.target.closest('#lightbox')){lb.hidden=true;return}
  var cp=e.target.closest&&e.target.closest('[data-copy]');
  if(cp){var txt=cp.getAttribute('data-copy');var done=function(){var o=cp.textContent;cp.textContent='Copied!';setTimeout(function(){cp.textContent=o},1200)};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,function(){window.prompt('Copy:',txt)})}else{window.prompt('Copy:',txt)}}
});
var cur=-1;
function jump(dir){
  var f=[].slice.call(app.querySelectorAll('.test.failed')).filter(function(el){return el.style.display!=='none'});
  if(!f.length)return;cur=(cur+dir+f.length)%f.length;f[cur].open=true;f[cur].scrollIntoView({block:'start'});
}
document.addEventListener('keydown',function(e){
  if(e.target===search){if(e.key==='Escape')search.blur();return}
  if(e.key==='Escape'){lb.hidden=true;return}
  if(e.key==='n')jump(1);else if(e.key==='p')jump(-1);else if(e.key==='/'){e.preventDefault();search.focus()}
});
})();
`;
