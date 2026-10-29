
import { test } from '@playwright/test';
import { CreateEventPage } from '../pages/CreateEventPage';

test.describe('Dashboard Authentication', () => {
    let dashboard: CreateEventPage;

    test.beforeEach(async ({ page }) => {
        dashboard = new CreateEventPage(page);
    });

    test('TC1 - Sign In page elements', async () => {
        await test.step('Open Sign In page', async () => {
            await dashboard.openSignInPage();
        });

        await test.step('Check Sign In form elements', async () => {
            await dashboard.checkSignInForm();
        });
    });

    test('TC2 - Sign In password visibility', async () => {
        await test.step('Open Sign In page', async () => {
            await dashboard.openSignInPage();
        });

        await test.step('Check password show and hide', async () => {
            await dashboard.checkPasswordVisibility(
                dashboard.passwordInput,
                dashboard.passwordEyeButton,
                'TestPassword123!'
            );
        });
    });

    test('TC3 - Navigate to Signup', async () => {
        await test.step('Open Sign In page', async () => {
            await dashboard.openSignInPage();
        });

        await test.step('Click Create Account', async () => {
            await dashboard.openSignupFromSignIn();
        });

        await test.step('Check Signup form', async () => {
            await dashboard.checkSignUpForm();
        });
    });

    test('TC4 - Signup page elements', async () => {
        await test.step('Open Signup page', async () => {
            await dashboard.openSignUpPage();
        });

        await test.step('Check all Signup fields', async () => {
            await dashboard.checkSignUpForm();
        });
    });

    test('TC5 - Signup password visibility', async () => {
        await test.step('Open Signup page', async () => {
            await dashboard.openSignUpPage();
        });

        await test.step('Check Password eye button', async () => {
            await dashboard.checkPasswordVisibility(
                dashboard.passwordInput,
                dashboard.passwordEyeButton,
                'TestPassword123!'
            );
        });

        await test.step('Check Confirm Password eye button', async () => {
            await dashboard.checkPasswordVisibility(
                dashboard.confirmPasswordInput,
                dashboard.confirmPasswordEyeButton,
                'TestPassword123!'
            );
        });
    });
});
