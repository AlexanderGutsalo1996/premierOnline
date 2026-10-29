
import { test } from '@playwright/test';
import { LegalPage } from '../pages/LegalPage';

test('Privacy Policy page', async ({ page }) => {
    const legalPage = new LegalPage(page);

    await test.step('Open Privacy Policy', async () => {
        await legalPage.openPrivacyPage();
    });

    await test.step('Check common elements', async () => {
        await legalPage.checkCommonElements();
    });

    await test.step('Check Privacy Policy title', async () => {
        await legalPage.checkPrivacyPage();
    });
});

test('Cookie Policy page', async ({ page }) => {
    const legalPage = new LegalPage(page);

    await test.step('Open Cookie Policy', async () => {
        await legalPage.openCookiesPage();
    });

    await test.step('Check common elements', async () => {
        await legalPage.checkCommonElements();
    });

    await test.step('Check Cookie Policy title', async () => {
        await legalPage.checkCookiesPage();
    });
});

test('Terms of Service page', async ({ page }) => {
    const legalPage = new LegalPage(page);

    await test.step('Open Terms of Service', async () => {
        await legalPage.openTermsPage();
    });

    await test.step('Check common elements', async () => {
        await legalPage.checkCommonElements();
    });

    await test.step('Check Terms of Service title', async () => {
        await legalPage.checkTermsPage();
    });
});

test('Privacy Policy language switch', async ({ page }) => {
    const legalPage = new LegalPage(page);

    await test.step('Open Privacy Policy', async () => {
        await legalPage.openPrivacyPage();
        await legalPage.checkArabicButton();
    });

    await test.step('Switch to Arabic', async () => {
        await legalPage.switchLanguage();
        await legalPage.checkEnglishButton();
        await legalPage.expectUrl(legalPage.privacyUrl);
    });

    await test.step('Switch back to English', async () => {
        await legalPage.switchLanguage();
        await legalPage.checkArabicButton();
        await legalPage.expectUrl(legalPage.privacyUrl);
    });
});
