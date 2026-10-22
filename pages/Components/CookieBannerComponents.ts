import { Page, Locator, expect } from '@playwright/test';
export class CookieBannerComponents {
    readonly page: Page;
    readonly cookieBanner: Locator;
    readonly cookieMessage: Locator;
    readonly privacyLink: Locator;
    readonly cookiePolicyLink: Locator;
    readonly closeMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.cookieBanner = this.page.locator('.cookieinfo');
        this.cookieMessage = this.cookieBanner.locator('span').first();
        this.privacyLink = this.cookieBanner.locator('a[href="/legal/privacy"]');
        this.cookiePolicyLink = this.cookieBanner.locator('a[href="http://www.cookieinfoscript.com"]');
        this.closeMessage = this.cookieBanner.locator('.cookieinfo-close');
    }

    async checkCookieBanner() {
        await expect(this.cookieBanner).toBeVisible();
    }
    async checkCookieMessage() {
        await expect(this.cookieMessage).toContainText(
            'Premiere Online uses cookies to deliver superior functionality'
        );
    }
    async checkPrivacyLink() {
        await expect(this.privacyLink).toBeVisible();
        await expect(this.privacyLink).toHaveText('here.');
        await expect(this.privacyLink).toHaveAttribute('href', '/legal/privacy');
        await expect(this.privacyLink).toHaveAttribute('target', '_blank');
    }
    async checkCookiePolicyLink() {
        await expect(this.cookiePolicyLink).toHaveAttribute(
            'href',
            'http://www.cookieinfoscript.com'
        );
    }
    async checkCloseMessage() {
        await expect(this.closeMessage).toBeVisible();
        await expect(this.closeMessage).toContainText(
            'Click here if you do not want to see this message again.'
        );
    }
    async checkCookieBannerComponents() {
        await this.checkCookieBanner();
        await this.checkCookieMessage();
        await this.checkPrivacyLink();
        await this.checkCookiePolicyLink();
        await this.checkCloseMessage();
    }
}
