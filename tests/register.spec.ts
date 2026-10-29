
import { test } from '@playwright/test';
import { RegisterPage } from '../pages/RegistePage';
import { generateRegistrationData } from '../Data/registration';

test.describe('Registration page', () => {
  let register: RegisterPage;

  test.beforeEach(async ({ page }) => {
    register = new RegisterPage(page);
    await register.openRegisterPage();
  });

  test('check the registration form elements', async () => {
    await test.step('Verify registration form elements', async () => {
      await register.checkRegistrationForm();
    });
  });

  test('fill the registration form with generated data', async () => {
    const data = generateRegistrationData();

    await test.step('Fill registration form', async () => {
      await register.fillRegistrationForm(data);
    });

    await test.step('Verify entered registration data', async () => {
      await register.checkRegistrationData(data);
    });

    // Account creation requires reCAPTCHA.
    // This test verifies form entry only.
  });
});
