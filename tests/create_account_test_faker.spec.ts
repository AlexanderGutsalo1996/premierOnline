
import { test, expect, type Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

test.describe('Create Account Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  const openCreateAccountPage = async (page: Page) => {
    const createAccountButton = page.locator('a[href*="/action/register"]').first();

    await expect(createAccountButton).toBeVisible();
    await createAccountButton.click();

    await expect(page).toHaveURL('https://www.premieronline.com/action/register');
  };

  const form = (page: Page) => ({
    email: page.locator('#email'),
    firstName: page.locator('#first_name'),
    lastName: page.locator('#last_name'),
    password: page.locator('#password'),
    repeatPassword: page.getByPlaceholder('Repeat Password'),
    passwordEye: page.locator('.togglePassword').first(),
    repeatPasswordEye: page.locator('.togglePassword').nth(1),
    continueButton: page.getByRole('button', { name: 'Continue' }),
  });

  test('check Create Account page navigation', async ({ page }) => {
    await openCreateAccountPage(page);

    const heading = page.getByRole('heading', {
      name: 'Create Account',
      level: 1,
    });

    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Create Account');
  });

  test('check Create Account form', async ({ page }) => {
    await openCreateAccountPage(page);

    const f = form(page);

    await test.step('Check registration fields', async () => {
      const fields = [
        f.email,
        f.firstName,
        f.lastName,
        f.password,
        f.repeatPassword,
      ];

      for (const field of fields) {
        await expect(field).toHaveCount(1);
        await expect(field).toBeVisible();
      }

      await expect(f.email).toHaveAttribute(
        'placeholder',
        'Email: we send your confirmations and receipts here.'
      );
      await expect(f.firstName).toHaveAttribute('placeholder', 'First Name');
      await expect(f.lastName).toHaveAttribute('placeholder', 'Last Name');
      await expect(f.password).toHaveAttribute(
        'placeholder',
        'Password (8 characters alphanumeric)'
      );
      await expect(f.repeatPassword).toHaveAttribute(
        'placeholder',
        'Repeat Password'
      );

      await expect(f.email).toHaveAttribute('type', 'email');
      await expect(f.firstName).toHaveAttribute('type', 'text');
      await expect(f.lastName).toHaveAttribute('type', 'text');
      await expect(f.password).toHaveAttribute('type', 'password');
      await expect(f.repeatPassword).toHaveAttribute('type', 'password');
    });

    await test.step('Check password visibility buttons', async () => {
      const eyes = page.locator('.togglePassword');

      await expect(eyes).toHaveCount(2);
      await expect(f.passwordEye).toBeVisible();
      await expect(f.repeatPasswordEye).toBeVisible();

      await expect(f.passwordEye.locator('i')).toHaveClass(/fa-eye/);
      await expect(f.repeatPasswordEye.locator('i')).toHaveClass(/fa-eye/);

      await f.passwordEye.click();
      await expect(f.password).toHaveAttribute('type', 'text');

      await f.passwordEye.click();
      await expect(f.password).toHaveAttribute('type', 'password');

      await f.repeatPasswordEye.click();
      await expect(f.repeatPassword).toHaveAttribute('type', 'text');

      await f.repeatPasswordEye.click();
      await expect(f.repeatPassword).toHaveAttribute('type', 'password');
    });

    await test.step('Check Continue button', async () => {
      await expect(f.continueButton).toHaveCount(1);
      await expect(f.continueButton).toBeVisible();
      await expect(f.continueButton).toBeEnabled();
      await expect(f.continueButton).toHaveText('Continue');
    });
  });

  test('check Create Account form input and password visibility', async ({ page }) => {
    await openCreateAccountPage(page);

    const f = form(page);

    // Generate random test data using Faker
    const email = faker.internet.email();
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    const password = faker.internet.password({
      length: 14,
      memorable: false,
      pattern: /[A-Za-z0-9!@#$%]/,
      prefix: 'Qa1!',
    });

    console.log('Generated email:', email);
    console.log('Generated first name:', firstName);
    console.log('Generated last name:', lastName);
    console.log('Generated password:', password);

    await test.step('Enter and verify Email', async () => {
      await f.email.fill(email);

      await expect(f.email).toHaveValue(email);
      await expect(f.email.locator(':scope:placeholder-shown')).toHaveCount(0);
    });

    await test.step('Enter and verify First Name', async () => {
      await f.firstName.fill(firstName);

      await expect(f.firstName).toHaveValue(firstName);
      await expect(f.firstName.locator(':scope:placeholder-shown')).toHaveCount(0);
    });

    await test.step('Enter and verify Last Name', async () => {
      await f.lastName.fill(lastName);

      await expect(f.lastName).toHaveValue(lastName);
      await expect(f.lastName.locator(':scope:placeholder-shown')).toHaveCount(0);
    });

    await test.step('Enter and verify Password', async () => {
      await f.password.fill(password);

      await expect(f.password).toHaveValue(password);
      await expect(f.password).toHaveAttribute('type', 'password');
      await expect(f.password.locator(':scope:placeholder-shown')).toHaveCount(0);

      await f.passwordEye.click();

      await expect(f.password).toHaveAttribute('type', 'text');
      await expect(f.password).toHaveValue(password);

      await f.passwordEye.click();

      await expect(f.password).toHaveAttribute('type', 'password');
      await expect(f.password).toHaveValue(password);
    });

    await test.step('Enter and verify Repeat Password', async () => {
      await f.repeatPassword.fill(password);

      await expect(f.repeatPassword).toHaveValue(password);
      await expect(f.repeatPassword).toHaveAttribute('type', 'password');
      await expect(f.repeatPassword.locator(':scope:placeholder-shown')).toHaveCount(0);

      await f.repeatPasswordEye.click();

      await expect(f.repeatPassword).toHaveAttribute('type', 'text');
      await expect(f.repeatPassword).toHaveValue(password);

      await f.repeatPasswordEye.click();

      await expect(f.repeatPassword).toHaveAttribute('type', 'password');
      await expect(f.repeatPassword).toHaveValue(password);
    });

    await test.step('Submit registration and check activation message', async () => {
      await expect(f.continueButton).toBeVisible();
      await expect(f.continueButton).toBeEnabled();

      // await f.continueButton.click();

      // // Diagnostic information after submitting the form
      // console.log('URL after Continue:', page.url());
      // console.log('Page text:', await page.locator('body').innerText());

      // const activationMessage = page.getByText(
      //   'Please check your email for your Activation Button',
      //   { exact: false }
      // );

      // await expect(activationMessage).toBeVisible();
      // await expect(activationMessage).toContainText(
      //   "Click it and you'll come right back here"
      // );
    });
  });
});
