import { test, expect } from '../fixtures/evidence';
import { BasePage } from '../pages/BasePage';
import type { Page } from '@playwright/test';

class DemoPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }
}

test('Evidence demo: before and after', async ({ page, evidence }) => {
    test.skip(process.env.EVIDENCE_MODE !== '1', 'Demo is only for Evidence Mode');
    await page.goto('data:text/html,<html><body style="font:24px system-ui;padding:60px"><h1>Evidence demo</h1><p id="status">Pending</p><button onclick="document.getElementById(\'status\').textContent=\'Approved\'">Approve</button></body></html>');
    const demo = new DemoPage(page);
    await expect(page.locator('#status')).toHaveText('Pending');
    await evidence.checkpoint('Before: status is Pending');
    await evidence.caption('Click Approve');
    await demo.click(page.getByRole('button', { name: 'Approve' }), 'Approve');
    await demo.expectText(page.locator('#status'), 'Approved', 'Status');
    await evidence.checkpoint('After: status is Approved');
});

test('Evidence demo: failed assertion', async ({ page, evidence }) => {
    test.skip(process.env.EVIDENCE_FAILURE_DEMO !== '1', 'Optional red evidence demo');
    test.fail();
    await page.goto('data:text/html,<html><body style="font:24px system-ui;padding:60px"><h1>Evidence demo</h1><p id="status">Pending</p></body></html>');
    await evidence.caption('Verify that status becomes Approved');
    const demo = new DemoPage(page);
    await demo.expectText(page.locator('#status'), 'Approved', 'Status');
});
