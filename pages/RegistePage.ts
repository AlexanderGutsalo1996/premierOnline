
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export interface RegistrationData {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    repeatPassword: string;
}

export class RegisterPage extends BasePage {
    readonly expectedEmailType = 'email';
    readonly expectedPasswordType = 'password';
    readonly expectedButtonType = 'submit';
    readonly expectedButtonText = 'Continue';

    readonly registrationForm: Locator;
    readonly emailInput: Locator;
    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly passwordInput: Locator;
    readonly repeatPasswordInput: Locator;
    readonly continueButton: Locator;

    constructor(page: Page) {
        super(page);

        this.registrationForm = page.locator(
            'form[action$="/create_profile.php"]'
        );

        this.emailInput = this.registrationForm.locator('#email');
        this.firstNameInput = this.registrationForm.locator('#first_name');
        this.lastNameInput = this.registrationForm.locator('#last_name');
        this.passwordInput = this.registrationForm.locator('#password');
        this.repeatPasswordInput = this.registrationForm.locator('#password_repeat');

        this.continueButton = this.registrationForm.getByRole('button', {
            name: this.expectedButtonText,
            exact: true
        });
    }

    async openRegisterPage() {
        await this.goto('/action/register');
    }

    async checkRegistrationForm() {
        await this.expectVisible(this.registrationForm);

        const fields = [
            this.emailInput,
            this.firstNameInput,
            this.lastNameInput,
            this.passwordInput,
            this.repeatPasswordInput
        ];

        for (const field of fields) {
            await this.expectVisible(field);
            await this.expectEditable(field);
            await this.expectValue(field, '');
        }

        await this.expectAttribute(
            this.emailInput,
            'type',
            this.expectedEmailType
        );

        await this.expectAttribute(
            this.passwordInput,
            'type',
            this.expectedPasswordType
        );

        await this.expectAttribute(
            this.repeatPasswordInput,
            'type',
            this.expectedPasswordType
        );

        await this.expectVisible(this.continueButton);
        await this.expectEnabled(this.continueButton);

        await this.expectAttribute(
            this.continueButton,
            'type',
            this.expectedButtonType
        );
    }

    async fillRegistrationForm(data: RegistrationData) {
        await this.fill(this.emailInput, data.email);
        await this.fill(this.firstNameInput, data.firstName);
        await this.fill(this.lastNameInput, data.lastName);
        await this.fill(this.passwordInput, data.password);
        await this.fill(this.repeatPasswordInput, data.repeatPassword);
    }

    async checkRegistrationData(data: RegistrationData) {
        await this.expectValue(this.emailInput, data.email);
        await this.expectValue(this.firstNameInput, data.firstName);
        await this.expectValue(this.lastNameInput, data.lastName);
        await this.expectValue(this.passwordInput, data.password);
        await this.expectValue(this.repeatPasswordInput, data.repeatPassword);
    }

    async submitRegistration() {
        await this.click(this.continueButton);
    }
}
