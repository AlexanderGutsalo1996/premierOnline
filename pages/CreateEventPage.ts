
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class CreateEventPage extends BasePage {
    readonly signInUrl = 'https://dash.premieronline.com/';
    readonly signUpUrl = 'https://dash.premieronline.com/signup';

    readonly signInForm: Locator;
    readonly signUpForm: Locator;

    readonly emailInput: Locator;
    readonly passwordInput: Locator;

    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly confirmPasswordInput: Locator;

    readonly signInButton: Locator;
    readonly signUpButton: Locator;
    readonly createAccountButton: Locator;
    readonly forgotPasswordLink: Locator;

    readonly passwordEyeButton: Locator;
    readonly confirmPasswordEyeButton: Locator;

    constructor(page: Page) {
        super(page);

        // Forms
        this.signInForm = page.locator('form');
        this.signUpForm = page.locator('form');

        // Shared fields
        this.emailInput = page.locator('#email');
        this.passwordInput = page.locator('#password');

        // Signup fields
        this.firstNameInput = page.locator('#first_name');
        this.lastNameInput = page.locator('#last_name');
        this.confirmPasswordInput = page.locator('#confirmPassword');

        // Submit buttons
        this.signInButton = this.signInForm.getByRole('button', {
            name: 'Sign In',
            exact: true
        });

        this.signUpButton = this.signUpForm.getByRole('button', {
            name: 'Signup',
            exact: true
        });

        // Navigation
        this.createAccountButton = page
            .getByRole('main')
            .getByRole('button', {
                name: 'Create Account',
                exact: true
            });

        this.forgotPasswordLink = this.signInForm.locator(
            'a[href="/forgot-password"]'
        );

        // Password visibility
        this.passwordEyeButton = this.passwordInput.locator(
            'xpath=following-sibling::button'
        );

        this.confirmPasswordEyeButton = this.confirmPasswordInput.locator(
            'xpath=following-sibling::button'
        );
    }

    async openSignInPage() {
        await this.goto(this.signInUrl);
    }

    async openSignUpPage() {
        await this.goto(this.signUpUrl);
    }

    async checkSignInForm() {
        await this.expectVisible(this.signInForm);

        // Email
        await this.expectVisible(this.emailInput);
        await this.expectEditable(this.emailInput);
        await this.expectValue(this.emailInput, '');
        await this.expectAttribute(this.emailInput, 'type', 'email');
        await this.expectAttribute(
            this.emailInput,
            'placeholder',
            'Email Address'
        );

        // Password
        await this.expectVisible(this.passwordInput);
        await this.expectEditable(this.passwordInput);
        await this.expectValue(this.passwordInput, '');
        await this.expectAttribute(this.passwordInput, 'type', 'password');
        await this.expectAttribute(
            this.passwordInput,
            'placeholder',
            'Password'
        );

        // Sign In button
        await this.expectVisible(this.signInButton);
        await this.expectEnabled(this.signInButton);
        await this.expectAttribute(this.signInButton, 'type', 'submit');

        // Forgot Password
        await this.expectVisible(this.forgotPasswordLink);
        await this.expectAttribute(
            this.forgotPasswordLink,
            'href',
            '/forgot-password'
        );

        // Password eye
        await this.expectVisible(this.passwordEyeButton);
        await this.expectAttribute(this.passwordEyeButton, 'type', 'button');

        // Create Account navigation
        await this.expectVisible(this.createAccountButton);
    }

    async checkSignUpForm() {
        await this.expectVisible(this.signUpForm);

        // All fields
        const fields = [
            this.firstNameInput,
            this.lastNameInput,
            this.emailInput,
            this.passwordInput,
            this.confirmPasswordInput
        ];

        for (const field of fields) {
            await this.expectVisible(field);
            await this.expectEditable(field);
            await this.expectValue(field, '');
        }

        // First Name
        await this.expectAttribute(this.firstNameInput, 'type', 'text');
        await this.expectAttribute(
            this.firstNameInput,
            'placeholder',
            'First Name'
        );

        // Last Name
        await this.expectAttribute(this.lastNameInput, 'type', 'text');
        await this.expectAttribute(
            this.lastNameInput,
            'placeholder',
            'Last Name'
        );

        // Email
        await this.expectAttribute(this.emailInput, 'type', 'email');
        await this.expectAttribute(
            this.emailInput,
            'placeholder',
            'Email Id'
        );

        // Password
        await this.expectAttribute(this.passwordInput, 'type', 'password');
        await this.expectAttribute(
            this.passwordInput,
            'placeholder',
            'Password'
        );

        // Confirm Password
        await this.expectAttribute(
            this.confirmPasswordInput,
            'type',
            'password'
        );
        await this.expectAttribute(
            this.confirmPasswordInput,
            'placeholder',
            'Confirm Password'
        );

        // Signup button
        await this.expectVisible(this.signUpButton);
        await this.expectEnabled(this.signUpButton);
        await this.expectAttribute(this.signUpButton, 'type', 'submit');

        // Password eyes
        await this.expectVisible(this.passwordEyeButton);
        await this.expectVisible(this.confirmPasswordEyeButton);
        await this.expectAttribute(this.passwordEyeButton, 'type', 'button');
        await this.expectAttribute(this.confirmPasswordEyeButton, 'type', 'button');
    }

    async openSignupFromSignIn() {
        await this.click(this.createAccountButton);
        await this.expectUrl(this.signUpUrl);
    }

    async checkPasswordVisibility(
        input: Locator,
        eyeButton: Locator,
        password: string
    ) {
        // Fill password
        await this.fill(input, password);
        await this.expectValue(input, password);

        // Password hidden
        await this.expectAttribute(input, 'type', 'password');

        // Show password
        await this.click(eyeButton);
        await this.expectAttribute(input, 'type', 'text');
        await this.expectValue(input, password);

        // Hide password
        await this.click(eyeButton);
        await this.expectAttribute(input, 'type', 'password');
        await this.expectValue(input, password);
    }
}
