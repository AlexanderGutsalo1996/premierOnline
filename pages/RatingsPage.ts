
import { Page, Locator, expect } from '@playwright/test';

export interface ExpectedRating {
    eventName: string;
    month: string;
    day: string;
    rating: string;
    url?: string;
}

export class RatingsPage {
    readonly page: Page;
    readonly content: Locator;
    readonly heading: Locator;
    readonly ratingsCounter: Locator;
    readonly yearLinks: Locator;
    readonly activeYearLink: Locator;
    readonly ratingsTable: Locator;
    readonly ratingRows: Locator;
    readonly eventLinks: Locator;

    constructor(page: Page) {
        this.page = page;
        this.content = page.locator('.content');
        this.heading = this.content.locator('h2.title');
        this.ratingsCounter = this.heading.locator('#countdown');
        this.yearLinks = this.content.locator('nav a');
        this.activeYearLink = this.content.locator('nav .uk-active a');
        this.ratingsTable = this.content.locator('table.uk-table');
        this.ratingRows = this.ratingsTable.locator('tbody > tr');
        this.eventLinks = this.ratingRows.locator('.event_name a');
    }

    async openRatingsPage() {
        await this.page.goto('/event_ratings.php');
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
                /\/event_ratings\.php\?y=\d{4}$/
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

    async checkRatingsContent(maxRows = 5) {
        await expect(this.ratingsCounter).toBeVisible();
        await expect(this.ratingsCounter).toContainText(
            'Ratings and counting'
        );
        await expect(
            this.ratingsCounter.locator('.timer')
        ).toHaveText(/^\d+$/);

        await expect(this.ratingsTable).toBeVisible();

        const totalRows = await this.ratingRows.count();
        const rowsToCheck = Math.min(totalRows, maxRows);

        for (let i = 0; i < rowsToCheck; i++) {
            const row = this.ratingRows.nth(i);

            await expect(row).toBeVisible();
            await expect(
                row.locator('.event_name a')
            ).toHaveText(/\S/);

            await expect(
                row.locator('.event_name a')
            ).toHaveAttribute(
                'href',
                /\/show_rating\/[^/]+/
            );

            await expect(
                row.locator('.month')
            ).toHaveText(/\S/);

            await expect(
                row.locator('.day')
            ).toHaveText(/^\d{1,2}$/);

            await expect(
                row.locator('td').last()
            ).toHaveText(
                /^\s*(?:\d+(?:\.\d+)?|Insufficient ratings)\s*$/
            );
        }
    }

    async checkRating(
        index: number,
        expected: ExpectedRating
    ) {
        const row = this.ratingRows.nth(index);
        const eventLink = row.locator('.event_name a');

        await expect(row).toBeVisible();

        await expect(eventLink).toHaveText(
            expected.eventName
        );

        await expect(
            row.locator('.month')
        ).toHaveText(expected.month);

        await expect(
            row.locator('.day')
        ).toHaveText(expected.day);

        await expect(
            row.locator('td').last()
        ).toHaveText(expected.rating);

        if (expected.url !== undefined) {
            await expect(eventLink).toHaveAttribute(
                'href',
                expected.url
            );
        }
    }

    async checkRatingsCount(expectedCount: number) {
        await expect(this.ratingRows).toHaveCount(
            expectedCount
        );
    }

    async openEventRating(index = 0) {
        const eventLink = this.eventLinks.nth(index);

        await expect(eventLink).toBeVisible();
        await eventLink.click();
    }

    async checkRatingsPage() {
        await expect(this.page).toHaveTitle('Event Ratings');
        await expect(this.heading).toBeVisible();
        await expect(this.heading).toContainText(
            'Event Ratings'
        );

        await this.checkYearNavigation();
        await this.checkRatingsContent();
    }
}
