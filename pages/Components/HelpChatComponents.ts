
import { Page, Locator, expect } from '@playwright/test';
export class HelpChatComponents {
    readonly page: Page;
    readonly chatButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.chatButton = this.page.locator('div.d-hotline[aria-label="Open chat"]');
    }

    async checkChatButton() {
        await expect(this.chatButton).toBeVisible();
        await expect(this.chatButton).toHaveAttribute('role', 'button');
        await expect(this.chatButton).toHaveAttribute('aria-label', 'Open chat');
    }
}
