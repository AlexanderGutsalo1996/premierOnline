import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertVideo, publishLatest, specName } from './evidence-files';

/**
 * Neon test tracker: a self-contained HTML report (tracker-report/index.html) that shows at a glance which tests
 * passed / failed, points at the exact failing step, gives a probable diagnosis (app bug vs test issue vs
 * environment vs flaky) and embeds the evidence (annotated MP4, screenshots, trace).
 * Opened automatically after local runs (not on CI, not with NO_REPORT_OPEN); on CI it is uploaded as an artifact.
 */

const OUT_DIR = 'tracker-report';

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

function diagnose(message: string, flaky: boolean, timedOut: boolean): Diagnosis {
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

export default class NeonTrackerReporter implements Reporter {
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
      title: 'TEST TRACKER',
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
    writeFileSync(indexFile, renderHtml(data));
    console.log(`\nTest tracker: ${OUT_DIR}/index.html  (${counts.failed} failed, ${counts.flaky} flaky, ${counts.passed} passed)`);
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
      record.diagnosis = diagnose(record.error, status === 'flaky', record.timedOut);
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

function renderHtml(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test Tracker</title>
<style>${CSS}</style>
</head>
<body>
<div class="sky"></div><div class="sun"></div><div class="floor"></div>
<main id="app"></main>
<div id="lightbox" hidden><img alt=""></div>
<script id="data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = `
:root{--bg:#0a0414;--panel:rgba(22,9,42,.78);--line:rgba(255,46,151,.35);--pink:#ff2e97;--cyan:#00f0ff;--purple:#9d4dff;--orange:#ff8a3d;--green:#2dff9a;--red:#ff3860;--yellow:#ffe14d;--text:#f6ecff;--muted:#b49bd6}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.sky{position:fixed;inset:0;z-index:-3;background:linear-gradient(180deg,#07020f 0%,#1a0636 40%,#4b0e5e 66%,#b3105a 88%,#ff6f3c 100%)}
.sun{position:fixed;z-index:-2;left:50%;bottom:14vh;width:min(46vw,460px);aspect-ratio:1;transform:translateX(-50%);border-radius:50%;
 background:linear-gradient(180deg,var(--yellow) 0%,var(--orange) 40%,var(--pink) 80%);opacity:.55;filter:blur(.3px);
 -webkit-mask:repeating-linear-gradient(180deg,#000 0 14px,transparent 14px 18px);mask:repeating-linear-gradient(180deg,#000 0 14px,transparent 14px 18px);
 -webkit-mask-size:100% 55%;mask-size:100% 55%;-webkit-mask-position:bottom;mask-position:bottom;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
 box-shadow:0 0 120px 20px rgba(255,46,151,.35)}
.floor{position:fixed;z-index:-1;left:-50%;right:-50%;bottom:0;height:34vh;transform-origin:50% 100%;transform:perspective(380px) rotateX(58deg);
 background:repeating-linear-gradient(90deg,rgba(0,240,255,.45) 0 2px,transparent 2px 70px),repeating-linear-gradient(0deg,rgba(255,46,151,.5) 0 2px,transparent 2px 46px),linear-gradient(180deg,rgba(10,4,20,.9),rgba(10,4,20,.1))}
main{max-width:1180px;margin:0 auto;padding:28px 18px 80px}
h1{margin:0;font:900 clamp(26px,5vw,52px)/1.05 Impact,"Arial Black",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;
 background:linear-gradient(90deg,var(--pink),var(--orange) 55%,var(--yellow));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(255,46,151,.7))}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin:14px 0 22px;color:var(--muted);font-size:13px}
.meta b{color:var(--text);font-weight:600}
.meta a{color:var(--cyan);text-decoration:none;border-bottom:1px dashed rgba(0,240,255,.55);text-shadow:0 0 8px rgba(0,240,255,.5)}
.meta a:hover{border-bottom-style:solid}
.banner{display:flex;align-items:center;gap:16px;padding:16px 22px;margin-bottom:18px;border:1px solid;border-radius:14px;background:var(--panel);backdrop-filter:blur(6px)}
.banner .big{font:900 clamp(22px,3.4vw,34px)/1 Impact,"Arial Black",sans-serif;letter-spacing:.08em;text-transform:uppercase}
.banner.ok{border-color:var(--green);box-shadow:0 0 28px rgba(45,255,154,.25),inset 0 0 22px rgba(45,255,154,.08)}.banner.ok .big{color:var(--green);text-shadow:0 0 18px var(--green)}
.banner.bad{border-color:var(--pink);box-shadow:0 0 34px rgba(255,46,151,.4),inset 0 0 24px rgba(255,46,151,.1)}.banner.bad .big{color:var(--pink);text-shadow:0 0 20px var(--pink);animation:flick 3.2s infinite}
.banner .hint{color:var(--muted);font-size:14px}
@keyframes flick{0%,92%,100%{opacity:1}93%{opacity:.55}94%{opacity:1}96%{opacity:.7}}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
.card{padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);backdrop-filter:blur(6px)}
.card .n{font:900 38px/1 Impact,"Arial Black",sans-serif;letter-spacing:.04em}
.card .l{color:var(--muted);font-size:12px;letter-spacing:.22em;text-transform:uppercase}
.card.pass .n{color:var(--green);text-shadow:0 0 16px var(--green)}.card.fail .n{color:var(--pink);text-shadow:0 0 16px var(--pink)}
.card.flaky .n{color:var(--yellow);text-shadow:0 0 16px var(--yellow)}.card.skip .n{color:var(--muted)}.card.total .n{color:var(--cyan);text-shadow:0 0 16px var(--cyan)}
.bar{display:flex;height:10px;border-radius:99px;overflow:hidden;margin-bottom:20px;background:rgba(255,255,255,.08)}
.bar i{display:block;height:100%}
.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.pill{cursor:pointer;border:1px solid var(--line);background:rgba(22,9,42,.7);color:var(--text);padding:7px 14px;border-radius:99px;font:600 12px/1 inherit;letter-spacing:.14em;text-transform:uppercase}
.pill:hover{border-color:var(--cyan);box-shadow:0 0 14px rgba(0,240,255,.35)}
.pill.on{border-color:var(--pink);color:#fff;background:linear-gradient(90deg,rgba(255,46,151,.55),rgba(157,77,255,.45));box-shadow:0 0 16px rgba(255,46,151,.5)}
.search{flex:1;min-width:200px;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:rgba(10,4,20,.7);color:var(--text);font:inherit}
.search:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 14px rgba(0,240,255,.4)}
h2{margin:26px 0 10px;font:800 15px/1 inherit;letter-spacing:.3em;text-transform:uppercase;color:var(--cyan);text-shadow:0 0 10px rgba(0,240,255,.6)}
.test{margin-bottom:12px;border:1px solid var(--line);border-left-width:5px;border-radius:12px;background:var(--panel);backdrop-filter:blur(6px);overflow:hidden}
.test.failed{border-color:var(--pink);box-shadow:0 0 24px rgba(255,46,151,.28)}.test.flaky{border-color:var(--yellow)}.test.passed{border-left-color:var(--green)}.test.skipped{border-left-color:var(--muted)}
.test>summary{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:12px 16px;cursor:pointer;list-style:none}
.test>summary::-webkit-details-marker{display:none}
.badge{min-width:64px;text-align:center;padding:4px 10px;border-radius:6px;font:900 12px/1.3 inherit;letter-spacing:.18em;text-transform:uppercase}
.badge.passed{color:#04140c;background:var(--green);box-shadow:0 0 14px rgba(45,255,154,.6)}
.badge.failed{color:#fff;background:var(--pink);box-shadow:0 0 16px rgba(255,46,151,.8)}
.badge.flaky{color:#241a00;background:var(--yellow);box-shadow:0 0 14px rgba(255,225,77,.6)}
.badge.skipped{color:#fff;background:#5b4a78}
.ttl{flex:1;min-width:220px}.ttl small{display:block;color:var(--muted);font-size:12px}
.dur{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.chip{padding:3px 10px;border-radius:99px;font:800 11px/1.4 inherit;letter-spacing:.12em;text-transform:uppercase;border:1px solid}
.chip.APP_BUG{color:var(--pink);border-color:var(--pink);text-shadow:0 0 8px var(--pink)}.chip.TEST{color:var(--purple);border-color:var(--purple)}
.chip.ENV{color:var(--orange);border-color:var(--orange)}.chip.FLAKY{color:var(--yellow);border-color:var(--yellow)}
.chip.CHECK{color:var(--cyan);border-color:var(--cyan)}.chip.UNKNOWN{color:var(--muted);border-color:var(--muted)}
.body{padding:4px 16px 18px;border-top:1px solid rgba(255,46,151,.2)}
.at{margin:14px 0;padding:14px 16px;border-radius:10px;border:1px solid var(--pink);background:linear-gradient(90deg,rgba(255,46,151,.22),rgba(157,77,255,.12));box-shadow:0 0 22px rgba(255,46,151,.3)}
.at .k{font:900 11px/1 inherit;letter-spacing:.3em;color:var(--pink);text-transform:uppercase;text-shadow:0 0 8px var(--pink)}
.at .path{margin-top:8px;font-size:16px;font-weight:600}.at .path span{color:var(--muted);margin:0 6px}.at .path b{color:#fff;text-shadow:0 0 10px var(--pink)}
.at .loc{margin-top:8px;color:var(--muted);font:12px/1.5 ui-monospace,Consolas,monospace}
.diag{margin:14px 0;padding:14px 16px;border-radius:10px;border:1px solid var(--cyan);background:rgba(0,240,255,.07)}
.diag .k{font:900 11px/1 inherit;letter-spacing:.3em;color:var(--cyan);text-transform:uppercase}
.diag h4{margin:8px 0 4px;font-size:16px}.diag p{margin:4px 0 8px;color:var(--text)}.diag ul{margin:6px 0 0;padding-left:20px;color:var(--text)}.diag li{margin:3px 0}
.diff{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:8px 0;font:13px/1.45 ui-monospace,Consolas,monospace}
.diff .e{color:var(--green)}.diff .r{color:var(--pink)}.diff .v{word-break:break-word}
.steps{margin:14px 0}.steps .k{font:900 11px/1 inherit;letter-spacing:.3em;color:var(--purple);text-transform:uppercase;margin-bottom:8px}
.steps ol{list-style:none;margin:0;padding-left:0}.steps ol ol{padding-left:22px;border-left:1px dashed rgba(157,77,255,.4);margin-left:8px}
.st{display:flex;gap:10px;align-items:baseline;padding:4px 8px;border-radius:6px}
.st .ic{width:16px;text-align:center;font-weight:900}.st .ms{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}
.st.ok .ic{color:var(--green)}.st.hook{color:var(--muted)}
.st.bad{background:linear-gradient(90deg,rgba(255,46,151,.35),transparent);box-shadow:inset 3px 0 0 var(--pink)}
.st.bad .ic{color:var(--pink);text-shadow:0 0 8px var(--pink)}
.st.here{box-shadow:inset 3px 0 0 var(--pink),0 0 18px rgba(255,46,151,.45);color:#fff;font-weight:600}
.st.here::after{content:"\\25C0  FAILED HERE";margin-left:10px;color:var(--pink);font:900 11px/1 inherit;letter-spacing:.2em;text-shadow:0 0 8px var(--pink);animation:blink 1.1s infinite}
@keyframes blink{50%{opacity:.35}}
.ev{margin:14px 0}.ev .k{font:900 11px/1 inherit;letter-spacing:.3em;color:var(--orange);text-transform:uppercase;margin-bottom:8px}
.evg{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;align-items:start}
.evg figure{margin:0}.evg figcaption{font-size:12px;color:var(--muted);margin-top:4px}
.evg img,.evg video{display:block;width:100%;border-radius:8px;border:1px solid var(--line);background:#000;cursor:zoom-in}
.evg video{cursor:default}.vid{grid-column:1/-1}.vid video{max-height:520px}
.tools2{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.btn{cursor:pointer;border:1px solid var(--cyan);background:rgba(0,240,255,.08);color:var(--cyan);padding:6px 12px;border-radius:8px;font:700 12px/1 inherit;letter-spacing:.08em;text-decoration:none}
.btn:hover{background:rgba(0,240,255,.2);box-shadow:0 0 14px rgba(0,240,255,.4)}
code,pre{font:12px/1.5 ui-monospace,Consolas,monospace}
pre{white-space:pre-wrap;word-break:break-word;margin:8px 0 0;padding:12px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);color:#ffd5ea;max-height:340px;overflow:auto}
details.raw>summary{cursor:pointer;color:var(--muted);font-size:13px}
.foot{margin-top:40px;text-align:center;color:var(--muted);font-size:12px;letter-spacing:.2em;text-transform:uppercase}
.empty{padding:24px;text-align:center;color:var(--muted)}
#lightbox{position:fixed;inset:0;z-index:50;background:rgba(5,2,12,.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out}
#lightbox[hidden]{display:none}#lightbox img{max-width:94vw;max-height:94vh;border:1px solid var(--pink);box-shadow:0 0 40px rgba(255,46,151,.5)}
.call{margin:6px 0;border:1px solid var(--line);border-radius:8px;background:rgba(10,4,20,.5)}
.call>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:8px 12px}
.call>summary::-webkit-details-marker{display:none}
.call .u{flex:1;min-width:200px;font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--muted);word-break:break-all}
.call .cb{padding:0 12px 12px}.k2{margin:8px 0 2px;font:800 11px/1 inherit;letter-spacing:.2em;color:var(--muted);text-transform:uppercase}
.chip.s2{color:var(--green);border-color:var(--green)}.chip.s3{color:var(--cyan);border-color:var(--cyan)}.chip.s4{color:var(--orange);border-color:var(--orange)}.chip.s5{color:var(--red);border-color:var(--red)}
.note{margin:14px 0;padding:10px 14px;border-radius:8px;border:1px dashed var(--line);color:var(--muted);font-size:13px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important}}
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

var banner=c.failed>0
 ?'<div class="banner bad"><span class="big">'+c.failed+' test'+(c.failed>1?'s':'')+' failed</span><span class="hint">Failures are listed first. Each one points at the failing step and suggests where the problem is.</span></div>'
 :c.flaky>0
 ?'<div class="banner ok"><span class="big">All passed \\u2014 '+c.flaky+' flaky</span><span class="hint">Flaky tests failed at first and passed on retry.</span></div>'
 :'<div class="banner ok"><span class="big">All systems go</span><span class="hint">Every test passed.</span></div>';

var pct=function(n){return total?(n/total*100).toFixed(2)+'%':'0%'};
var started=new Date(D.startedAt);
var meta='<span>Started <b>'+esc(started.toLocaleString())+'</b></span><span>Duration <b>'+fmt(D.durationMs)+'</b></span>'+(String(D.baseURL).indexOf('http')===0?'<span>Project <b><a href="'+esc(D.baseURL)+'" target="_blank" rel="noopener">'+esc(D.baseURL)+'</a></b></span>':'')+(D.evidenceMode?'<span><b>EVIDENCE MODE</b></span>':'')+(D.ci?'<span>CI run <b>#'+esc(D.ci.run)+'</b> \\u00b7 '+esc(D.ci.branch)+' \\u00b7 '+esc(D.ci.trigger)+(D.ci.sha?' \\u00b7 '+esc(D.ci.sha):'')+'</span>':'');

var html='<h1>'+esc(D.title)+'</h1><div class="meta">'+meta+'</div>'+banner;
html+='<div class="cards"><div class="card total"><div class="n">'+total+'</div><div class="l">Total</div></div><div class="card pass"><div class="n">'+c.passed+'</div><div class="l">Passed</div></div><div class="card fail"><div class="n">'+c.failed+'</div><div class="l">Failed</div></div><div class="card flaky"><div class="n">'+c.flaky+'</div><div class="l">Flaky</div></div><div class="card skip"><div class="n">'+c.skipped+'</div><div class="l">Skipped</div></div></div>';
html+='<div class="bar"><i style="width:'+pct(c.passed)+';background:var(--green);box-shadow:0 0 12px var(--green)"></i><i style="width:'+pct(c.flaky)+';background:var(--yellow)"></i><i style="width:'+pct(c.failed)+';background:var(--pink);box-shadow:0 0 12px var(--pink)"></i><i style="width:'+pct(c.skipped)+';background:#5b4a78"></i></div>';
html+='<div class="tools">'+['all','failed','flaky','passed','skipped'].map(function(f){var n=f==='all'?total:c[f];return '<button class="pill'+(f==='all'?' on':'')+'" data-filter="'+f+'">'+f+' '+n+'</button>'}).join('')+'<input class="search" type="search" placeholder="Search tests, files\\u2026  ( / )" aria-label="Search tests"></div>';
html+='<div id="list">'+D.tests.map(card).join('')+'</div>';
if(!D.tests.length)html+='<div class="empty">No tests in this run.</div>';
html+='<div class="foot">Keys: N / P next / previous failure \\u00b7 / search \\u00b7 click a screenshot to enlarge</div>';
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
