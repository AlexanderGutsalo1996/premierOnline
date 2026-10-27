
import { test } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { HeaderComponents } from '../pages/Components/HeaderComponents';
import { FooterComponents } from '../pages/Components/FooterComponents';

test.describe('Test Home Page', () => {
    let homePage: HomePage;
    let headerComponents: HeaderComponents;
    let footerComponents: FooterComponents;

    test.beforeEach(async ({ page }) => {
        homePage = new HomePage(page);
        headerComponents = new HeaderComponents(page);
        footerComponents = new FooterComponents(page);

        await homePage.openHomePage();
        await homePage.verifyTitle();
    });

    test('check the header elements', async () => {
        await headerComponents.checkLogoLink();
        await headerComponents.checkLogoImg();
        await headerComponents.checkSearchInput();
        await headerComponents.checkNavMenu();
        await headerComponents.checkSignInButton();
        await headerComponents.checkCreateAccountButton();
    });

    test('check the footer elements', async () => {
        await footerComponents.checkFooterComponents();
    });

    test('check the home page elements', async () => {
        await homePage.checkHomePageComponents();
    });
});
