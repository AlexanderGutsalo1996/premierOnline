import { test } from '../fixtures/evidence';
import { SignInPage, type SignInData } from '../pages/SignInPage';
import { getLoginCredentials } from '../config/env';
import signInData from '../Data/signInData.json';

test.describe('Sign In page', () => {
    let signIn: SignInPage;
    const invalidData: SignInData = signInData.invalid;
    const formData: SignInData = signInData.form;

    test.beforeEach(async ({ page }) => {
        signIn = new SignInPage(page);
        await signIn.openSignInPage();
    });

    test('check the sign in form elements', async () => {
        await test.step('Verify sign in form elements', async () => {
            await signIn.checkSignInForm();
        });
    });

    test('fill the sign in form', async () => {
        await test.step('Fill email and password', async () => {
            await signIn.fillSignInForm(formData);
        });

        await test.step('Verify entered credentials', async () => {
            await signIn.checkSignInData(formData);
        });
    });

    test('show and hide password', async () => {
        await test.step('Fill the password field', async () => {
            await signIn.fillSignInForm(formData);
        });

        await test.step('Show password', async () => {
            await signIn.showPassword();
        });

        await test.step('Hide password', async () => {
            await signIn.hidePassword();
        });
    });

    test('check the sign in links', async () => {
        await test.step('Verify sign in navigation links', async () => {
            await signIn.checkSignInLinks();
        });
    });

    test('negative login with invalid credentials', async () => {
        await test.step('Enter invalid credentials', async () => {
            await signIn.fillSignInForm(invalidData);
        });

        await test.step('Submit login form', async () => {
            await signIn.submitSignIn();
        });

        await test.step('Verify login error message', async () => {
            await signIn.expectVisible(signIn.loginErrorMessage);
        });
    });

    test('positive login with valid credentials', async () => {
        // Real credentials come only from .env.local / CI secrets, never from tracked files.
        const testData: SignInData = getLoginCredentials();

        await test.step('Enter valid credentials', async () => {
            await signIn.fillSignInForm(testData);
        });

        await test.step('Submit login form', async () => {
            await signIn.submitSignIn();
        });

        await test.step('Verify successful authentication', async () => {
            await signIn.expectSignedIn();
        });
    });
});
