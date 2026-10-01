import { test, expect } from '@playwright/test';
 
test.describe('Test Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });
 
  test('should have the correct title', async ({ page }) => {
    await expect(page).toHaveURL('/');
    await expect(page).toHaveTitle(
      /Premier Online - leading provider of online event registration for sports events/
    );
  });
 
  test('check the header', async ({ page }) => {
    const header = page.locator('.uk-logo');
    await expect(header).toBeVisible();
    await expect(header).toHaveClass(/uk-logo/);
    await expect(header).toHaveAttribute('href', 'https://www.premieronline.com');
 
    const logo = header.locator('img');
    await expect(logo).toHaveAttribute('src', 'https://www.premieronline.com/assets/img/logo.svg');
    // NOTE: "Premiere" vs the site name "Premier" - confirm which is intended
    await expect(logo).toHaveAttribute('alt', 'Premiere Online');
  });
 
  test('check the search functionality', async ({ page }) => {
    const searchInput = page.locator('#search');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'Search by Event Name or Organiser');
    await expect(searchInput).toHaveAttribute('type', 'search');
  });
 
  test('check the Sign Up button', async ({ page }) => {
    const signUpButton = page.locator('.uk-button-secondary').first();
    await expect(signUpButton).toBeVisible();
    await expect(signUpButton).toBeEnabled();
    await expect(signUpButton).toHaveClass(/uk-button-secondary/);
    await expect(signUpButton).toHaveText(/Sign in|Sign up/);
  });
 
  test('check the Create Account button', async ({ page }) => {
    const createAccountButton = page.locator('.uk-sticky .uk-button-primary').first();
    await expect(createAccountButton).toBeVisible();
  });
 
  test('check the Top Navigation and language selector', async ({ page }) => {
    // Locators are lazy, so one helper works before and after the language switch
    const menu = () => {
      const topMenu = page.locator('ul.uk-navbar-nav.uk-visible\\@m');
      return {
        topMenu,
        events: topMenu.locator('a[href*="/calendar"]'),
        ratings: topMenu.locator('a[href*="/event_ratings.php"]'),
        help: topMenu.locator('a[href*="/help"]'),
        arabic: topMenu.locator('a[href*="lang=ar"]'),
        english: topMenu.locator('a[href*="lang=en"]'),
      };
    };
 
    await test.step('English top menu', async () => {
      const m = menu();
      await expect(m.topMenu).toBeVisible();
      await expect(m.events).toHaveText('Events');
      await expect(m.ratings).toHaveText('Ratings');
      await expect(m.help).toHaveText('Help');
      await expect(m.arabic).toHaveText('عربى');
      await m.arabic.click();
    });
 
    await test.step('Arabic top menu', async () => {
      const m = menu();
      await expect(m.english).toBeVisible(); 
      await expect(m.events).toHaveText('الفعاليات');
      await expect(m.ratings).toHaveText('التقييمات');
      await expect(m.help).toHaveText('مساعدة');
      await expect(m.english).toHaveText('English');
     
    });
 
    // await test.step('English top menu after switching back', async () => {
    //   const m = menu();
    //   await expect(m.arabic).toBeVisible();
    //   await expect(m.events).toHaveText('Events');
    //   await expect(m.ratings).toHaveText('Ratings');
    //   await expect(m.help).toHaveText('Help');
    //   await expect(m.arabic).toHaveText('عربى');
    // });
  });
});