
import { test, expect } from '@playwright/test';
import { SignInPage, type SignInData } from '../pages/SignInPage';
import dotenv from 'dotenv';
import signInData from '../Data/authData.json';

// Load credentials from .env.local
dotenv.config({ path: '.env.local' });

test.describe('Sign In page', () => {
    let signIn: SignInPage;
    const testData: SignInData = signInData.valid;
    const invalidData: SignInData = signInData.invalid;
    const formData: SignInData = signInData.form;

    // const testData: SignInData = {
    //     email: 'test@example.com',
    //     password: 'TestPass123!'
    // };

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

    test('negative login with invalid credentials', async ({ page }) => {
        
        // const invalidData: SignInData = {
        //     email: 'invalid-user@example.com',
        //     password: 'WrongPassword123!'
        // };

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

    test('positive login with valid credentials', async ({ page }) => {
    if (!testData.email || !testData.password) {
        throw new Error(
            'Valid email and password must be provided in authData.json'
        );
    }
        // const email = process.env.LOGIN_EMAIL;
        // const password = process.env.LOGIN_PASSWORD;
        // if (!email || !password) {
        //     throw new Error(
        //         'LOGIN_EMAIL and LOGIN_PASSWORD must be set in .env.local'
        //     );
        // }


        await test.step('Enter valid credentials', async () => {
            await signIn.fillSignInForm(testData);
        });

        await test.step('Submit login form', async () => {
            await signIn.submitSignIn();
        });

        await test.step('Verify successful authentication', async () => {
            await signIn.expectHidden(signIn.loginErrorMessage);

            await expect(page).not.toHaveURL(/\/action\/dologin/);
        });
    });
});
