import { Page, Locator, expect } from '@playwright/test';

export interface RegistrationData {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    repeatPassword: string;
}

export class Register {
    readonly page: Page;
    readonly registrationForm: Locator;
    readonly emailInput: Locator;
    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly passwordInput: Locator;
    readonly repeatPasswordInput: Locator;
    readonly continueButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.registrationForm = page.locator('form[action$="/create_profile.php"]');
        this.emailInput = this.registrationForm.locator('#email');
        this.firstNameInput = this.registrationForm.locator('#first_name');
        this.lastNameInput = this.registrationForm.locator('#last_name');
        this.passwordInput = this.registrationForm.locator('#password');
        this.repeatPasswordInput = this.registrationForm.locator('#password_repeat');
        this.continueButton = this.registrationForm.getByRole('button', { name: 'Continue', exact: true });
    }

    async openRegisterPage() {
        await this.page.goto('/action/register');
    }

    async checkRegistrationForm() {
        await expect(this.registrationForm).toBeVisible();
        for (const field of [this.emailInput, this.firstNameInput, this.lastNameInput,
            this.passwordInput, this.repeatPasswordInput]) {
            await expect(field).toBeVisible();
            await expect(field).toBeEditable();
            await expect(field).toHaveValue('');
        }
        await expect(this.emailInput).toHaveAttribute('type', 'email');
        await expect(this.passwordInput).toHaveAttribute('type', 'password');
        await expect(this.repeatPasswordInput).toHaveAttribute('type', 'password');
        await expect(this.continueButton).toBeVisible();
        await expect(this.continueButton).toBeEnabled();
        await expect(this.continueButton).toHaveAttribute('type', 'submit');
    }

    async fillRegistrationForm(data: RegistrationData) {
        await this.emailInput.fill(data.email);
        await this.firstNameInput.fill(data.firstName);
        await this.lastNameInput.fill(data.lastName);
        await this.passwordInput.fill(data.password);
        await this.repeatPasswordInput.fill(data.repeatPassword);
    }

    async checkRegistrationData(data: RegistrationData) {
        await expect(this.emailInput).toHaveValue(data.email);
        await expect(this.firstNameInput).toHaveValue(data.firstName);
        await expect(this.lastNameInput).toHaveValue(data.lastName);
        await expect(this.passwordInput).toHaveValue(data.password);
        await expect(this.repeatPasswordInput).toHaveValue(data.repeatPassword);
    }

    async submitRegistration() {
        await this.continueButton.click();
    }
}
