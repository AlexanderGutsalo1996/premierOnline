
import { Page, Locator, expect } from '@playwright/test';

export class FooterComponents {
    readonly page: Page;
    readonly footer: Locator;
    readonly navmenu: Locator;
    readonly privacyPolicy: Locator;
    readonly cookies: Locator;
    readonly termsConditions: Locator;
    readonly termsOfUse: Locator;
    readonly createEvent: Locator;
    readonly contactUs: Locator;
    readonly copyright: Locator;

    constructor(page: Page) {
        this.page = page;

        this.footer = this.page.locator('footer');
        this.navmenu = this.footer.locator('ul.uk-navbar-nav');

        this.privacyPolicy = this.navmenu.locator('a[href*="/legal/privacy"]');
        this.cookies = this.navmenu.locator('a[href*="/legal/cookies"]');
        this.termsConditions = this.navmenu.locator('a[href*="/legal/terms-participant"]');
        this.termsOfUse = this.navmenu.locator('a[href*="/legal/terms-of-service"]');
        this.createEvent = this.navmenu.locator('#create-event-link');
        this.contactUs = this.navmenu.locator('a[href*="/help"]');

        this.copyright = this.footer.locator('.copyright');
    }

    async checkFooter() {
        await expect(this.footer).toBeVisible();
        await expect(this.navmenu).toBeVisible();
    }

    async checkPrivacyPolicy() {
        await expect(this.privacyPolicy).toBeVisible();
        await expect(this.privacyPolicy).toHaveAttribute(
            'href',
            'https://www.premieronline.com/legal/privacy'
        );
    }

    async checkCookies() {
        await expect(this.cookies).toBeVisible();
        await expect(this.cookies).toHaveAttribute(
            'href',
            'https://www.premieronline.com/legal/cookies'
        );
    }

    async checkTermsConditions() {
        await expect(this.termsConditions).toBeVisible();
        await expect(this.termsConditions).toHaveAttribute(
            'href',
            'https://www.premieronline.com/legal/terms-participant'
        );
    }

    async checkTermsOfUse() {
        await expect(this.termsOfUse).toBeVisible();
        await expect(this.termsOfUse).toHaveAttribute(
            'href',
            'https://www.premieronline.com/legal/terms-of-service'
        );
    }

    async checkCreateEvent() {
        await expect(this.createEvent).toBeVisible();
        await expect(this.createEvent).toHaveAttribute('id', 'create-event-link');
        await expect(this.createEvent).toHaveText('Create Event');
    }

    async checkContactUs() {
        await expect(this.contactUs).toBeVisible();
        await expect(this.contactUs).toHaveAttribute(
            'href',
            'https://www.premieronline.com/help'
        );
    }

    async checkCopyright() {
        await expect(this.copyright).toBeAttached();
        await expect(this.copyright).toContainText('Copyright © Premier Online');
    }

    async checkFooterComponents() {
        await this.checkFooter();
        await this.checkPrivacyPolicy();
        await this.checkCookies();
        await this.checkTermsConditions();
        await this.checkTermsOfUse();
        await this.checkCreateEvent();
        await this.checkContactUs();
        await this.checkCopyright();
    }
}
