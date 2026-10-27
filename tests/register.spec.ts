import { test } from '@playwright/test';
import { Register } from '../pages/Register';
import { getRegistrationData } from '../Data/registration';



test.describe('Registration page', () => {
    let register: Register;

    test.beforeEach(async ({ page }) => {
        register = new Register(page);
        await register.openRegisterPage();
    });

    test('check the registration form elements', async () => {
        await register.checkRegistrationForm();
    });

    test('fill the registration form with local environment data', async () => {
        const data = getRegistrationData();
        await register.fillRegistrationForm(data);
        await register.checkRegistrationData(data);
        // Account creation requires reCAPTCHA; this test verifies form entry only.
    });
});

