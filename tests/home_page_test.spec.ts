import { test } from '@playwright/test';

test.describe('Test Home Page', () => {
test.beforeEach(async ({ page }) => {
    await page.goto('/');
});
    test('should have the correct title', async ({ page }) => {
        await test.step('Go to the home page and check title and URL', async () => {
            await test.expect(page).toHaveURL('/');
            await test.expect(page).toHaveTitle(/Premier Online - leading provider of online event registration for sports events/);
        });
    });

    test('check the header', async ({ page }) => {
        await test.step('check the header', async () => {
            const header = page.locator('.uk-logo');
            await test.expect(header).toBeVisible();
            await test.expect(header).toHaveAttribute('class', 'uk-navbar-item uk-logo');
            await test.expect(header).toHaveAttribute('href', 'https://www.premieronline.com');
            const logo = header.locator('img');
            await test.expect(logo).toHaveAttribute('src', 'https://www.premieronline.com/assets/img/logo.svg');
            await test.expect(logo).toHaveAttribute('alt', 'Premiere Online');
        });
    });
test('check the search functionality', async ({ page }) => {
    await test.step('check the search functionality', async () => {
        const searchInput = page.locator('#search');
        await test.expect(searchInput).toBeVisible();
        await test.expect(searchInput).toHaveAttribute('placeholder', 'Search by Event Name or Organiser');
        await test.expect(searchInput).toHaveAttribute('type', 'search');
       });
    });
    test('check the Sign Up button', async ({ page }) => {
        await test.step('check the Sign Up button', async () => {
            const signUpButton = page.locator('.uk-button-secondary').nth(0);
            await test.expect(signUpButton).toBeVisible();
            await test.expect(signUpButton).toHaveAttribute('class', 'uk-button uk-button-secondary');
            await test.expect(signUpButton).toBeVisible();
            await test.expect(signUpButton).toBeEnabled();
            await test.expect(signUpButton).toHaveText(/Sign in|Sign up/);
        });
    });
    test('check the Create Account button', async ({ page }) => {
    await test.step('check the Create Account button', async () => {
        const createAccountButton = page.locator('.uk-sticky .uk-button-primary').nth(0);
        await test.expect(createAccountButton).toBeVisible();
       });
    });
    test('check the Top Navigation and language selector', async ({ page }) => {
        await test.step('check the Top Navigation and language selector', async () => {
            const topMenu = page.locator('ul.uk-navbar-nav.uk-visible\\@m');
            const event = topMenu.locator('a[href*="/calendar"]');
            const ratings = topMenu.locator('a[href*="/event_ratings.php"]');
            const help = topMenu.locator('a[href*="/help"]');
            const arabic = topMenu.locator('a[href*="lang=ar"]');
            // Check elements visible
            await test.expect(topMenu).toBeVisible();
            await test.expect(event).toBeVisible();
            await test.expect(ratings).toBeVisible();
            await test.expect(help).toBeVisible();
            await test.expect(arabic).toBeVisible();
            //Check text
            await test.expect(event).toHaveText('Events');
            await test.expect(ratings).toHaveText('Ratings');
            await test.expect(help).toHaveText('Help');
            await test.expect(arabic).toHaveText('عربى');
           // Click عربى
           await arabic.click();
           // Check elements visible
        await test.step('check Arabic top menu', async () => {
            const topMenu = page.locator('ul.uk-navbar-nav.uk-visible\\@m');
            const event = topMenu.locator('a[href*="/calendar"]');
            const ratings = topMenu.locator('a[href*="/event_ratings.php"]');
            const help = topMenu.locator('a[href*="/help"]');
            const english = topMenu.locator('a[href*="lang=en"]');
            await test.expect(topMenu).toBeVisible();
            await test.expect(event).toBeVisible();
            await test.expect(ratings).toBeVisible();
            await test.expect(help).toBeVisible();
            await test.expect(english).toBeVisible();
            //Check text
            await test.expect(event).toHaveText('الفعاليات');
            await test.expect(ratings).toHaveText('التقييمات');
            await test.expect(help).toHaveText('مساعدة');
            await test.expect(english).toHaveText('English');
    //         // Click English
    //         await english.click();
    // });

    // await test.step('check English top menu after switching back', async () => {
    //     const topMenu = page.locator('ul.uk-navbar-nav.uk-visible\\@m');
    //     const event = topMenu.locator('a[href*="/calendar"]');
    //     const ratings = topMenu.locator('a[href*="/event_ratings.php"]');
    //     const help = topMenu.locator('a[href*="/help"]');
    //     const arabic = topMenu.locator('a[href*="lang=ar"]');

    //    // Check that all English menu items are visible again
    //    await test.expect(topMenu).toBeVisible();
    //     await test.expect(event).toBeVisible();
    //     await test.expect(ratings).toBeVisible();
    //     await test.expect(help).toBeVisible();
    //     await test.expect(arabic).toBeVisible();

    //     // Check that all English texts are restored
    //     await test.expect(event).toHaveText('Events');
    //     await test.expect(ratings).toHaveText('Ratings');
    //     await test.expect(help).toHaveText('Help');
    //     await test.expect(arabic).toHaveText('عربى');
    });

});
         });
    });