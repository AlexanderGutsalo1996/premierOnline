
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export interface SignInData {
    email: string;
    password: string;
}

export class SignInPage extends BasePage {
    readonly page: Page;
    readonly signInForm: Locator;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly signInButton: Locator;
    readonly togglePassword: Locator;
    readonly forgotPasswordLink: Locator;
    readonly createAccountLink: Locator;
    readonly registerAsGuestLink: Locator;
    readonly loginErrorMessage: Locator;

    constructor(page: Page) {
        super(page);

        this.page = page;
        this.signInForm = page.locator('form[action$="/login.php"]');
        this.emailInput = this.signInForm.locator('#login_name');
        this.passwordInput = this.signInForm.locator('#password');
        this.signInButton = this.signInForm.getByRole('button', { name: 'Sign in', exact: true });
        this.togglePassword = this.signInForm.locator('#togglePassword');
        this.forgotPasswordLink = this.signInForm.getByRole('link', { name: 'Forgot your password?', exact: true });
        this.createAccountLink = this.signInForm.getByRole('link', { name: 'Create Account', exact: true });
        this.registerAsGuestLink = this.signInForm.getByRole('link', { name: 'Register as a Guest', exact: true });
        this.loginErrorMessage = page.getByText('Sorry, you were not recognized', { exact: false });
    }

    async openSignInPage() {
        await this.goto('/action/dologin');
    }

    async checkSignInForm() {
        await this.expectVisible(this.signInForm);
        await this.expectAttribute(this.signInForm, 'method', 'post');

        for (const field of [this.emailInput, this.passwordInput]) {
            await this.expectVisible(field);
            await this.expectEditable(field);
            await this.expectValue(field, '');
        }

        await this.expectAttribute(this.emailInput, 'type', 'text');
        await this.expectAttribute(this.emailInput, 'name', 'login_name');
        await this.expectAttribute(this.emailInput, 'placeholder', 'Email address');
        await this.expectAttribute(this.passwordInput, 'type', 'password');
        await this.expectAttribute(this.passwordInput, 'name', 'password');
        await this.expectAttribute(this.passwordInput, 'placeholder', 'Password');
        await this.expectVisible(this.signInButton);
        await this.expectEnabled(this.signInButton);
        await this.expectText(this.signInButton, 'Sign in');
        await this.expectVisible(this.togglePassword);
    }

    async fillSignInForm(data: SignInData) {
        await this.fill(this.emailInput, data.email);
        await this.fill(this.passwordInput, data.password);
    }

    async checkSignInData(data: SignInData) {
        await this.expectValue(this.emailInput, data.email);
        await this.expectValue(this.passwordInput, data.password);
    }

    async submitSignIn() {
        await this.click(this.signInButton);
    }

    async showPassword() {
        await this.expectAttribute(this.passwordInput, 'type', 'password');
        await this.click(this.togglePassword);
        await this.expectAttribute(this.passwordInput, 'type', 'text');
    }

    async hidePassword() {
        await this.expectAttribute(this.passwordInput, 'type', 'text');
        await this.click(this.togglePassword);
        await this.expectAttribute(this.passwordInput, 'type', 'password');
    }

    async checkSignInLinks() {
        await this.expectVisible(this.forgotPasswordLink);
        await this.expectAttribute(this.forgotPasswordLink, 'href', 'https://www.premieronline.com/action/forgot_password');
        await this.expectVisible(this.createAccountLink);
        await this.expectAttribute(this.createAccountLink, 'href', 'https://www.premieronline.com/action/register');
        await this.expectVisible(this.registerAsGuestLink);
        await this.expectAttribute(this.registerAsGuestLink, 'href', 'https://www.premieronline.com/guest_add_create.php');
    }

    async openForgotPasswordPage() {
        await this.click(this.forgotPasswordLink);
    }

    async openRegisterPage() {
        await this.click(this.createAccountLink);
    }

    async openGuestRegistrationPage() {
        await this.click(this.registerAsGuestLink);
    }
}
