
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class EventsPage extends BasePage {
    readonly expectedTitle = 'Event Calendar';

    readonly content: Locator;
    readonly heading: Locator;
    readonly yearLinks: Locator;
    readonly activeYearLink: Locator;
    readonly monthItems: Locator;
    readonly monthTitles: Locator;
    readonly monthCounts: Locator;
    readonly monthContents: Locator;
    readonly eventLinks: Locator;

    // Relative selectors for elements inside a selected month.
    readonly monthEventLinks: (index: number) => Locator;
    readonly monthEventRows: (index: number) => Locator;

    constructor(page: Page) {
        super(page);

        this.content = page.locator('.content');
        this.heading = this.content.getByRole('heading', {
            name: 'Events Calendar',
            exact: true
        });
        this.yearLinks = this.content.locator('.years-nav a');
        this.activeYearLink = this.content.locator('.years-nav .uk-active a');
        this.monthItems = this.content.locator('ul[uk-accordion] > li');
        this.monthTitles = this.monthItems.locator('.uk-accordion-title');
        this.monthCounts = this.monthTitles.locator('span');
        this.monthContents = this.monthItems.locator('.uk-accordion-content');
        this.eventLinks = this.monthItems.locator('h4 a');

        this.monthEventLinks = index =>
            this.monthItems.nth(index).locator('h4 a');

        this.monthEventRows = index =>
            this.monthItems.nth(index).locator('tr').filter({
                has: page.locator('h4 a')
            });
    }

    async openEventsPage() {
        await this.goto('/calendar');
    }

    async checkYearNavigation() {
        await this.expectVisible(this.yearLinks.first());
        await this.expectVisible(this.activeYearLink);
        await this.expectText(this.activeYearLink, /^\d{4}$/);
        await this.expectAttribute(
            this.yearLinks.first(),
            'href',
            /\/calendar\/\d{4}$/
        );
    }

    async selectYear(year: string) {
        await this.click(this.yearLinks.getByText(year, { exact: true }));
        await this.expectText(this.activeYearLink, year);
    }

    async checkMonthNavigation() {
        await this.expectVisible(this.monthTitles.first());
        await this.expectAttribute(this.monthTitles.first(), 'href', '#');
        await this.expectText(this.monthCounts.first(), /\(\d+ Events?\)/);
    }

    async openMonth(index: number) {
        const content = this.monthContents.nth(index);

        if (!(await content.isVisible())) {
            await this.click(this.monthTitles.nth(index));
        }

        await this.expectVisible(content);
    }

    async closeMonth(index: number) {
        const content = this.monthContents.nth(index);

        if (await content.isVisible()) {
            await this.click(this.monthTitles.nth(index));
        }

        await this.expectHidden(content);
    }

    async checkMonthEvents(
        index: number,
        maxEvents = 5,
        expectedCount?: number
    ) {
        if (!Number.isInteger(maxEvents) || maxEvents < 0) {
            throw new Error('maxEvents must be a non-negative integer');
        }

        await this.openMonth(index);

        const rows = this.monthEventRows(index);
        const links = this.monthEventLinks(index);

        if (expectedCount !== undefined) {
            await this.expectCount(rows, expectedCount);
        }

        const toCheck = Math.min(await this.count(rows), maxEvents);

        for (let i = 0; i < toCheck; i++) {
            await this.expectVisible(rows.nth(i));
            await this.expectNotEmptyText(links.nth(i));
            await this.expectAttribute(
                links.nth(i),
                'href',
                /\/event\/[^/]+/
            );
        }
    }

    async openEvent(monthIndex: number, eventIndex = 0) {
        await this.openMonth(monthIndex);
        await this.click(this.monthEventLinks(monthIndex).nth(eventIndex));
    }

    async openEventByName(eventName: string) {
        await this.click(this.eventLinks.getByText(eventName, { exact: true }));
    }

    async checkEventsPage() {
        await this.expectTitle(this.expectedTitle);
        await this.expectVisible(this.heading);
        await this.checkYearNavigation();
        await this.checkMonthNavigation();
        await this.checkMonthEvents(0);
    }
}
