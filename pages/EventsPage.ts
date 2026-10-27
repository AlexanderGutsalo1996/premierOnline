
import { Page, Locator, expect } from '@playwright/test';

export class EventsPage {
    readonly page: Page;
    readonly content: Locator;
    readonly heading: Locator;
    readonly yearLinks: Locator;
    readonly activeYearLink: Locator;
    readonly monthItems: Locator;
    readonly monthTitles: Locator;
    readonly eventLinks: Locator;

    constructor(page: Page) {
        this.page = page;
        this.content = page.locator('.content');
        this.heading = this.content.getByRole('heading', {
            name: 'Events Calendar',
            exact: true
        });
        this.yearLinks = this.content.locator('.years-nav a');
        this.activeYearLink = this.content.locator('.years-nav .uk-active a');
        this.monthItems = this.content.locator('ul[uk-accordion] > li');
        this.monthTitles = this.monthItems.locator('.uk-accordion-title');
        this.eventLinks = this.monthItems.locator('h4 a');
    }

    async openEventsPage() {
        await this.page.goto('/calendar');
    }

    async checkYearNavigation() {
        await expect(this.yearLinks.first()).toBeVisible();
        await expect(this.activeYearLink).toBeVisible();
        await expect(this.activeYearLink).toHaveText(/^\d{4}$/);

        for (const link of await this.yearLinks.all()) {
            await expect(link).toBeVisible();
            await expect(link).toHaveText(/^\d{4}$/);
            await expect(link).toHaveAttribute(
                'href',
                /\/calendar\/\d{4}$/
            );
        }
    }

    async selectYear(year: string) {
        const yearLink = this.yearLinks.getByText(year, {
            exact: true
        });

        await yearLink.click();
        await expect(this.activeYearLink).toHaveText(year);
    }

    async checkMonthNavigation() {
        await expect(this.monthTitles.first()).toBeVisible();

        for (const title of await this.monthTitles.all()) {
            await expect(title).toBeVisible();
            await expect(title).toHaveAttribute('href', '#');
            await expect(title).toHaveText(/\S/);
            await expect(title.locator('span')).toHaveText(
                /\(\d+ Events?\)/
            );
        }
    }

    async openMonth(index: number) {
        const month = this.monthItems.nth(index);
        const title = month.locator('.uk-accordion-title');
        const content = month.locator('.uk-accordion-content');

        await expect(title).toBeVisible();

        if (!(await content.isVisible())) {
            await title.click();
        }

        await expect(content).toBeVisible();
    }

    async closeMonth(index: number) {
        const month = this.monthItems.nth(index);
        const title = month.locator('.uk-accordion-title');
        const content = month.locator('.uk-accordion-content');

        await expect(title).toBeVisible();

        if (await content.isVisible()) {
            await title.click();
        }

        await expect(content).toBeHidden();
    }

    async checkMonthEvents(
        index: number,
        maxEvents?: number,
        expectedCount?: number
    ) {
        await this.openMonth(index);

        const month = this.monthItems.nth(index);
        const rows = month.locator('tr').filter({
            has: this.page.locator('h4 a')
        });

        const totalEvents = await rows.count();

        if (expectedCount !== undefined) {
            await expect(rows).toHaveCount(expectedCount);
        }

        if (maxEvents !== undefined) {
            if (!Number.isInteger(maxEvents) || maxEvents < 0) {
                throw new Error(
                    'maxEvents must be a non-negative integer'
                );
            }
        }

        const eventsToCheck = maxEvents === undefined
            ? totalEvents
            : Math.min(totalEvents, maxEvents);

        for (let i = 0; i < eventsToCheck; i++) {
            const row = rows.nth(i);
            const eventLink = row.locator('h4 a');

            await expect(row).toBeVisible();
            await expect(eventLink).toHaveText(/\S/);
            await expect(eventLink).toHaveAttribute(
                'href',
                /\/event\/[^/]+/
            );

            await expect(row.locator('.month')).toHaveText(/\S/);
            await expect(row.locator('.day')).toHaveText(
                /^\d{1,2}$/
            );
            await expect(
                row.locator('td > .uk-text-muted')
            ).toHaveText(/\S/);

            const badges = row.locator('.uk-label');

            for (const badge of await badges.all()) {
                await expect(badge).toBeVisible();
                await expect(badge).toHaveText(/\S/);
            }
        }
    }

    async openEvent(monthIndex: number, eventIndex = 0) {
        await this.openMonth(monthIndex);

        const eventLink = this.monthItems
            .nth(monthIndex)
            .locator('h4 a')
            .nth(eventIndex);

        await expect(eventLink).toBeVisible();
        await eventLink.click();
    }

    async openEventByName(eventName: string) {
        const eventLink = this.eventLinks.getByText(eventName, {
            exact: true
        });

        await expect(eventLink).toBeVisible();
        await eventLink.click();
    }

    async checkEventsPage() {
        await expect(this.page).toHaveTitle('Event Calendar');
        await expect(this.heading).toBeVisible();

        await this.checkYearNavigation();
        await this.checkMonthNavigation();
        await this.checkMonthEvents(0, 5);
    }
}
