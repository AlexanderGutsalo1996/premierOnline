
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class LegalPage extends BasePage {
    readonly wrapper: Locator;
    readonly logo: Locator;
    readonly logoImage: Locator;
    readonly languageForm: Locator;
    readonly languageButton: Locator;
    readonly pageHeading: Locator;

    readonly privacyUrl = 'https://www.premieronline.com/legal/privacy/';
    readonly cookiesUrl = 'https://www.premieronline.com/legal/cookies/';
    readonly termsUrl = 'https://www.premieronline.com/legal/terms-participant/';

    constructor(page: Page) {
        super(page);

        this.wrapper = page.locator('#wrapper');
        this.logo = page.locator('.logo a');
        this.logoImage = page.locator('.logo a img');
        this.languageForm = page.locator('#switch-language-form');
        this.languageButton = page.locator('#switch-language-form .btn-switch');
        this.pageHeading = page.locator('#wrapper h1');
    }

    // Open legal pages
    async openPrivacyPage() {
        await this.goto(this.privacyUrl);
    }

    async openCookiesPage() {
        await this.goto(this.cookiesUrl);
    }

    async openTermsPage() {
        await this.goto(this.termsUrl);
    }

    // Check shared elements
    async checkCommonElements() {
        await this.expectVisible(this.wrapper, 'Legal page wrapper');
        await this.expectVisible(this.logo, 'Premier Online logo');
        await this.expectVisible(this.logoImage, 'Logo image');
        await this.expectAttached(this.languageForm, 'Language form');
        await this.expectVisible(this.languageButton, 'Language button');
        await this.expectVisible(this.pageHeading, 'Page heading');

        await this.expectAttribute(
            this.logo,
            'href',
            'https://www.premieronline.com',
            'Logo link'
        );
    }

    // Check page-specific titles and headings
    async checkPrivacyPage() {
        await this.expectTitle('Privacy Policy');
        await this.expectText(this.pageHeading, 'Privacy Policy');
    }

    async checkCookiesPage() {
        await this.expectTitle('Cookie Policy');
        await this.expectText(this.pageHeading, 'Cookie Policy');
    }

    async checkTermsPage() {
        await this.expectTitle('Terms of Service (Participants)');
        await this.expectNotEmptyText(this.pageHeading, 'Terms heading');
    }

    // Switch language
    async switchLanguage() {
        await this.click(this.languageButton, 'Language switch');
    }
    // Check language switch button
    async checkArabicButton() {
        await this.expectText(this.languageButton, 'عربی');
    }

    async checkEnglishButton() {
        await this.expectText(this.languageButton, 'English');
    }
    // Navigate to home page
    async clickLogo() {
        await this.click(this.logo, 'Premier Online logo');
        await this.expectUrl(/^https:\/\/www\.premieronline\.com\/?$/);
    }
}
