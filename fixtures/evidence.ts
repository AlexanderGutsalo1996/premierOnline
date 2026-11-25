import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

// Two levels of evidence:
// - default run:  captions, click highlights, video and a final screenshot for every executed UI test;
// - EVIDENCE_MODE=1 (npm run test:evidence): full evidence for EVERY test - trace, 1440x900 video, a screenshot
//                 checkpoint after each assertion and an MP4 for each test.
const fullMode = () => process.env.EVIDENCE_MODE === '1';

// Pacing: automated steps run in milliseconds, which makes the recorded video unreadable. Short pauses and human-like
// typing make it play at the speed of a quick user. EVIDENCE_PACE = user (default) | fast (half the pauses) | off.
const paceMode = () => (process.env.EVIDENCE_PACE || 'user').toLowerCase();
const PAUSE = { open: 900, click: 500, fill: 200, expect: 250, other: 150 } as const;

const active = new WeakMap<Page, EvidenceRecorder>();
export const evidenceFor = (page: Page) => active.get(page);

export class EvidenceRecorder {
    private sequence = 0;
    constructor(private page: Page, private info: TestInfo) {}

    async init() {
        active.set(this.page, this);
        await this.page.addInitScript(() => {
            document.addEventListener('pointerdown', event => {
                const ring = document.createElement('div');
                Object.assign(ring.style, { position: 'fixed', left: (event.clientX - 18) + 'px', top: (event.clientY - 18) + 'px', width: '36px', height: '36px', border: '3px solid #00b7ff', borderRadius: '50%', pointerEvents: 'none', zIndex: '2147483647' });
                document.body?.append(ring);
                setTimeout(() => ring.remove(), 650);
            }, true);
        });
    }

    // Step caption drawn over the page (recorded into the video and into screenshots).
    async caption(message: string, status: 'info' | 'pass' | 'fail' = 'info') {
        if (this.page.isClosed()) return;
        await this.page.evaluate(({ message, status }) => {
            document.getElementById('__pw_evidence_caption')?.remove();
            const host = document.createElement('div');
            host.id = '__pw_evidence_caption';
            host.setAttribute('aria-hidden', 'true');
            const box = document.createElement('div');
            box.textContent = (status === 'pass' ? '✓ ' : status === 'fail' ? '✗ ' : '') + message;
            Object.assign(box.style, { position: 'fixed', bottom: '26px', left: '50%', transform: 'translateX(-50%)', maxWidth: '80%', padding: '12px 22px', background: status === 'pass' ? '#087b45ed' : status === 'fail' ? '#ac2525ed' : '#152636ed', color: '#fff', font: '600 18px/1.35 system-ui, sans-serif', borderRadius: '8px', boxShadow: '0 4px 22px #0005', zIndex: '2147483647', pointerEvents: 'none', textAlign: 'center', direction: 'ltr' });
            host.attachShadow({ mode: 'closed' }).append(box);
            document.body?.append(host);
        }, { message, status });
    }

    async highlight(locator: Locator) {
        await locator.evaluate(element => {
            const box = element.getBoundingClientRect();
            const outline = document.createElement('div');
            Object.assign(outline.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px', border: '3px solid #00b7ff', borderRadius: '5px', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '2147483646' });
            document.body?.append(outline);
            setTimeout(() => outline.remove(), 900);
        }, undefined, { timeout: 1000 }).catch(() => {});
    }

    // Per-character typing delay in ms (0 = paste the whole value instantly).
    typingDelay() {
        const mode = paceMode();
        return mode === 'off' ? 0 : mode === 'fast' ? 20 : 45;
    }

    // Pause after a step so a viewer can follow the video.
    async pace(message: string) {
        const mode = paceMode();
        if (mode === 'off' || this.page.isClosed()) return;
        const kind = /^(Open URL|Reload|Go back)/.test(message) ? 'open'
            : /^(Click|Double click)/.test(message) ? 'click'
            : message.startsWith('Fill ') ? 'fill'
            : message.startsWith('Expect ') ? 'expect' : 'other';
        await this.page.waitForTimeout(mode === 'fast' ? PAUSE[kind] / 2 : PAUSE[kind]).catch(() => {});
    }

    // Screenshot checkpoint: after every assertion in full mode and at the end of every UI test.
    async checkpoint(message: string, status: 'pass' | 'fail' = 'pass', final = false) {
        if (this.page.isClosed()) return;
        await this.caption(message, status);
        if (!fullMode() && status !== 'fail' && !final) return;
        await this.page.waitForTimeout(700);
        const name = status === 'fail' ? 'evidence-failure' : 'evidence-' + ++this.sequence;
        const path = this.info.outputPath(name + '.png');
        await this.page.screenshot({ path });
        await this.info.attach(name, { path, contentType: 'image/png' });
    }

    async finish() {
        try {
            const status = this.info.status;
            if (status === 'skipped') return;
            const passed = status === 'passed';
            await this.checkpoint(passed ? 'Test passed' : 'Test ' + (status ?? 'failed'), passed ? 'pass' : 'fail', true);
        } finally {
            active.delete(this.page);
        }
    }
}

export const test = base.extend<{ evidence: EvidenceRecorder }>({
    evidence: [async ({ page }, use, testInfo) => {
        const recorder = new EvidenceRecorder(page, testInfo);
        await recorder.init();
        await use(recorder);
        await recorder.finish().catch(error => console.warn('Evidence screenshot:', error));

        // Playwright owns context teardown and trace finalization. The tracker converts
        // the finalized WebM attachment after the run, avoiding context/trace races.
    }, { auto: true }],
});

export { expect };
