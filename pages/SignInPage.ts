import { Page, Locator, expect } from '@playwright/test';

export interface SignInData {
    email: string;
    password: string;
}

export class SignInPage {
    readonly page: Page;
    readonly signInForm: Locator;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly signInButton: Locator;
    readonly togglePassword: Locator;
    readonly forgotPasswordLink: Locator;
    readonly createAccountLink: Locator;
    readonly registerAsGuestLink: Locator;

    constructor(page: Page) {
        this.page = page;
        this.signInForm = page.locator('form[action$="/login.php"]');
        this.emailInput = this.signInForm.locator('#login_name');
        this.passwordInput = this.signInForm.locator('#password');
        this.signInButton = this.signInForm.getByRole('button', { name: 'Sign in', exact: true });
        this.togglePassword = this.signInForm.locator('#togglePassword');
        this.forgotPasswordLink = this.signInForm.getByRole('link', { name: 'Forgot your password?', exact: true });
        this.createAccountLink = this.signInForm.getByRole('link', { name: 'Create Account', exact: true });
        this.registerAsGuestLink = this.signInForm.getByRole('link', { name: 'Register as a Guest', exact: true });
    }

    async openSignInPage() {
        await this.page.goto('/action/dologin');
    }

    async checkSignInForm() {
        await expect(this.signInForm).toBeVisible();
        await expect(this.signInForm).toHaveAttribute('method', 'post');
        for (const field of [this.emailInput, this.passwordInput]) {
            await expect(field).toBeVisible();
            await expect(field).toBeEditable();
            await expect(field).toHaveValue('');
        }
        await expect(this.emailInput).toHaveAttribute('type', 'text');
        await expect(this.emailInput).toHaveAttribute('name', 'login_name');
        await expect(this.emailInput).toHaveAttribute('placeholder', 'Email address');
        await expect(this.passwordInput).toHaveAttribute('type', 'password');
        await expect(this.passwordInput).toHaveAttribute('name', 'password');
        await expect(this.passwordInput).toHaveAttribute('placeholder', 'Password');
        await expect(this.signInButton).toBeVisible();
        await expect(this.signInButton).toBeEnabled();
        await expect(this.signInButton).toHaveText('Sign in');
        await expect(this.togglePassword).toBeVisible();
    }

    async fillSignInForm(data: SignInData) {
        await this.emailInput.fill(data.email);
        await this.passwordInput.fill(data.password);
    }

    async checkSignInData(data: SignInData) {
        await expect(this.emailInput).toHaveValue(data.email);
        await expect(this.passwordInput).toHaveValue(data.password);
    }

    async submitSignIn() {
        await this.signInButton.click();
    }

    async showPassword() {
        await expect(this.passwordInput).toHaveAttribute('type', 'password');
        await this.togglePassword.click();
        await expect(this.passwordInput).toHaveAttribute('type', 'text');
    }

    async hidePassword() {
        await expect(this.passwordInput).toHaveAttribute('type', 'text');
        await this.togglePassword.click();
        await expect(this.passwordInput).toHaveAttribute('type', 'password');
    }

    async checkSignInLinks() {
        await expect(this.forgotPasswordLink).toBeVisible();
        await expect(this.forgotPasswordLink).toHaveAttribute('href', 'https://www.premieronline.com/action/forgot_password');
        await expect(this.createAccountLink).toBeVisible();
        await expect(this.createAccountLink).toHaveAttribute('href', 'https://www.premieronline.com/action/register');
        await expect(this.registerAsGuestLink).toBeVisible();
        await expect(this.registerAsGuestLink).toHaveAttribute('href', 'https://www.premieronline.com/guest_add_create.php');
    }

    async openForgotPasswordPage() {
        await this.forgotPasswordLink.click();
    }

    async openRegisterPage() {
        await this.createAccountLink.click();
    }

    async openGuestRegistrationPage() {
        await this.registerAsGuestLink.click();
    }
}
