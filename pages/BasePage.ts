import { Page, Locator, Response, expect, test } from '@playwright/test';
import { Logger } from '../config/Logger';

// Allows expected values to be either text or a regular expression.
type Matcher = string | RegExp;

// Stores the browser page and creates a logger for each Page Object.
export abstract class BasePage {
    readonly page: Page;
    protected readonly logger: Logger;

    protected constructor(page: Page) {
        this.page = page;
        this.logger = new Logger(new.target.name);
    }

    // ───────────────────────── Core ─────────────────────────

    /**
     * Wraps any action: logs start, adds a step to the Playwright report,
     * logs failure with the reason and re-throws the error.
     */
    protected async step<T>(message: string, action: () => Promise<T>): Promise<T> {
        this.logger.info(message);

        try {
            return await test.step(message, action);
        } catch (error) {
            const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
            this.logger.error(`${message} -> FAILED: ${reason}`);
            throw error;
        }
    }

    // Returns a custom element name or the locator description for logging.
    protected label(locator: Locator, name?: string): string {
        return name ?? locator.toString();
    }


    // Opens the specified URL in the browser.
    async goto(url: string): Promise<void> {
        await this.step(`Open URL: ${url}`, () => this.page.goto(url).then(() => undefined));
    }

    // Reloads the current browser page.
    async reload(): Promise<void> {
        await this.step('Reload page', () => this.page.reload().then(() => undefined));
    }

    // Navigates back to the previous page in browser history.
    async goBack(): Promise<void> {
        await this.step('Go back', () => this.page.goBack().then(() => undefined));
    }


    // Verifies that an element is visible and enabled, then clicks it.
    async click(locator: Locator, name?: string): Promise<void> {
        await this.expectVisible(locator, name);
        await this.expectEnabled(locator, name);
        //try catch (error) {
        await this.step(`Click: ${this.label(locator, name)}`, () => locator.click());
    }

    // Double-clicks the specified element.
    async dblClick(locator: Locator, name?: string): Promise<void> {
        await this.step(`Double click: ${this.label(locator, name)}`, () => locator.dblclick());
    }

    // Moves the mouse cursor over an element.
    async hover(locator: Locator, name?: string): Promise<void> {
        await this.step(`Hover: ${this.label(locator, name)}`, () => locator.hover());
    }

    // Replaces the content of an input field with the provided value.
    async fill(locator: Locator, value: string, name?: string): Promise<void> {
        await this.step(`Fill "${value}" into: ${this.label(locator, name)}`, () =>
            locator.fill(value)
        );
    }

    // Clears the current value of an input field.
    async clear(locator: Locator, name?: string): Promise<void> {
        await this.step(`Clear: ${this.label(locator, name)}`, () => locator.clear());
    }
    // Presses a single key or a key combination (e.g. Enter or Control+A).
    async pressKey(locator: Locator, key: string, name?: string): Promise<void> {
        await this.step(`Press "${key}" on: ${this.label(locator, name)}`, () =>
            locator.press(key)
        );
    }

    // Checks a checkbox or radio button.
    async check(locator: Locator, name?: string): Promise<void> {
        await this.step(`Check: ${this.label(locator, name)}`, () => locator.check());
    }

    // Unhecks a checkbox or radio button.
    async uncheck(locator: Locator, name?: string): Promise<void> {
        await this.step(`Uncheck: ${this.label(locator, name)}`, () => locator.uncheck());
    }

    // Selects a dropdown option by its value.
    async selectOption(locator: Locator, value: string, name?: string): Promise<void> {
        await this.step(`Select "${value}" in: ${this.label(locator, name)}`, () =>
            locator.selectOption(value).then(() => undefined)
        );
    }

    // Scrolls the page until the specified element is in view.
    async scrollIntoView(locator: Locator, name?: string): Promise<void> {
        await this.step(`Scroll into view: ${this.label(locator, name)}`, () =>
            locator.scrollIntoViewIfNeeded()
        );
    }

    // Performs an action and waits for a matching server response.
    async actionAndWaitForResponse(
        urlPart: string,
        action: () => Promise<void>,
        description?: string
    ): Promise<Response> {
        return this.step(
            description ?? `Perform action and wait for response: ${urlPart}`,
            async () => {
                const responsePromise = this.page.waitForResponse(response =>
                    response.url().includes(urlPart)
                );
                await action();
                const response = await responsePromise;
                this.logger.debug(`Response ${response.status()} <- ${response.url()}`);
                return response;
            }
        );
    }



    // Returns the number of elements matching the locator.
    async count(locator: Locator, name?: string): Promise<number> {
        const total = await locator.count();
        this.logger.debug(`Count of ${this.label(locator, name)}: ${total}`);
        return total;
    }

    // Returns the element's text without leading or trailing whitespace.
    async getText(locator: Locator, name?: string): Promise<string> {
        const text = (await locator.innerText()).trim();
        this.logger.debug(`Text of ${this.label(locator, name)}: "${text}"`);
        return text;
    }

    // Returns an HTML attribute value or null if it does not exist.
    async getAttribute(locator: Locator, attribute: string, name?: string): Promise<string | null> {
        const value = await locator.getAttribute(attribute);
        this.logger.debug(`Attribute "${attribute}" of ${this.label(locator, name)}: "${value}"`);
        return value;
    }



    // Verifies the browser page title.
    async expectTitle(title: Matcher): Promise<void> {
        await this.step(`Expect page title: ${title}`, () =>
            expect(this.page).toHaveTitle(title)
        );
    }

    // Verifies the current page URL.
    async expectUrl(url: Matcher): Promise<void> {
        await this.step(`Expect page URL: ${url}`, () => expect(this.page).toHaveURL(url));
    }

    // Verifies that an element is visible.
    async expectVisible(locator: Locator, name?: string): Promise<void> {
        await this.step(`Expect visible: ${this.label(locator, name)}`, () =>
            expect(locator).toBeVisible()
        );
    }

    // Verifies that an element is hidden.
    async expectHidden(locator: Locator, name?: string): Promise<void> {
        await this.step(`Expect hidden: ${this.label(locator, name)}`, () =>
            expect(locator).toBeHidden()
        );
    }

    // Verifies that an element exists in the DOM.
    async expectAttached(locator: Locator, name?: string): Promise<void> {
        await this.step(`Expect attached to DOM: ${this.label(locator, name)}`, () =>
            expect(locator).toBeAttached()
        );
    }

    // Verifies that an element is enabled.
    async expectEnabled(locator: Locator, name?: string): Promise<void> {
        await this.step(`Expect enabled: ${this.label(locator, name)}`, () =>
            expect(locator).toBeEnabled()
        );
    }

    // Verifies that an element is disabled.
    async expectDisabled(locator: Locator, name?: string): Promise<void> {
        await this.step(`Expect disabled: ${this.label(locator, name)}`, () =>
            expect(locator).toBeDisabled()
        );
    }

    // Verifies the element's text.
    async expectText(locator: Locator, text: Matcher, name?: string): Promise<void> {
        await this.step(`Expect text ${text} in: ${this.label(locator, name)}`, () =>
            expect(locator).toHaveText(text)
        );
    }

    // Verifies that an element contains non-whitespace text.
    async expectNotEmptyText(locator: Locator, name?: string): Promise<void> {
        await this.expectText(locator, /\S/, name);
    }

    // Verifies the current value of an input.
    async expectValue(locator: Locator, value: Matcher, name?: string): Promise<void> {
        await this.step(`Expect value ${value} in: ${this.label(locator, name)}`, () =>
            expect(locator).toHaveValue(value)
        );
    }

    // Verifies an HTML attribute value.
    async expectAttribute(
        locator: Locator,
        attribute: string,
        value: Matcher,
        name?: string
    ): Promise<void> {
        await this.step(
            `Expect attribute "${attribute}" = ${value} on: ${this.label(locator, name)}`,
            () => expect(locator).toHaveAttribute(attribute, value)
        );
    }

    // Verifies the number of matching elements.
    async expectCount(locator: Locator, expected: number, name?: string): Promise<void> {
        await this.step(`Expect count ${expected} of: ${this.label(locator, name)}`, () =>
            expect(locator).toHaveCount(expected)
        );
    }

    // Check if the locator is editable
    async expectEditable(locator: Locator) {
        await this.step(
            `Expect editable: ${this.label(locator)}`,
            () => expect(locator).toBeEditable()
        );
    }
    // Performs a 5-click on the specified element.
    async performClick(locator: Locator) {
        await this.step(
            `Perform click: ${this.label(locator)}`,
            () => locator.click({ clickCount: 5 })
        );
    }

    // Clicks an element and verifies that the expected UI result appears.
    async clickAndVerify(
        button: Locator,
        expectedElement: Locator
    ) {
        await this.click(button);
        await this.expectVisible(expectedElement);
    }
}
