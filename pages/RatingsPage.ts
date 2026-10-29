
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ExpectedRating {
    eventName: string;
    month: string;
    day: string;
    rating: string;
    url?: string;
}

export class RatingsPage extends BasePage {
    readonly expectedTitle = 'Event Ratings';
    readonly expectedHeading = 'Event Ratings';
    readonly expectedCounterText = 'Ratings and counting';

    readonly content: Locator;
    readonly heading: Locator;
    readonly ratingsCounter: Locator;
    readonly ratingsTimer: Locator;
    readonly yearLinks: Locator;
    readonly activeYearLink: Locator;
    readonly ratingsTable: Locator;
    readonly ratingRows: Locator;
    readonly eventLinks: Locator;
    readonly ratingMonths: Locator;
    readonly ratingDays: Locator;
    readonly ratingValues: Locator;

    constructor(page: Page) {
        super(page);

        this.content = page.locator('.content');
        this.heading = this.content.locator('h2.title');
        this.ratingsCounter = this.heading.locator('#countdown');
        this.ratingsTimer = this.ratingsCounter.locator('.timer');

        this.yearLinks = this.content.locator('nav a');
        this.activeYearLink = this.content.locator('nav .uk-active a');

        this.ratingsTable = this.content.locator('table.uk-table');
        this.ratingRows = this.ratingsTable.locator('tbody > tr');

        this.eventLinks = this.ratingRows.locator('.event_name a');
        this.ratingMonths = this.ratingRows.locator('.month');
        this.ratingDays = this.ratingRows.locator('.day');
        this.ratingValues = this.ratingRows.locator('td:last-child');
    }

    async openRatingsPage() {
        await this.goto('/event_ratings.php');
    }

    async checkYearNavigation() {
        await this.expectVisible(this.yearLinks.first());
        await this.expectVisible(this.activeYearLink);
        await this.expectText(this.activeYearLink, /^\d{4}$/);

        const totalYears = await this.count(this.yearLinks);

        for (let i = 0; i < totalYears; i++) {
            const link = this.yearLinks.nth(i);

            await this.expectVisible(link);
            await this.expectText(link, /^\d{4}$/);
            await this.expectAttribute(
                link,
                'href',
                /\/event_ratings\.php\?y=\d{4}$/
            );
        }
    }

    async selectYear(year: string) {
        await this.click(
            this.yearLinks.getByText(year, { exact: true })
        );
        await this.expectText(this.activeYearLink, year);
    }

    async checkRatingsContent(maxRows = 5) {
        await this.expectVisible(this.ratingsCounter);
        await this.expectText(
            this.ratingsCounter,
            new RegExp(this.expectedCounterText)
        );
        await this.expectText(this.ratingsTimer, /^\d+$/);
        await this.expectVisible(this.ratingsTable);

        const totalRows = await this.count(this.ratingRows);
        const rowsToCheck = Math.min(totalRows, maxRows);

        for (let i = 0; i < rowsToCheck; i++) {
            await this.expectVisible(this.ratingRows.nth(i));
            await this.expectNotEmptyText(this.eventLinks.nth(i));
            await this.expectAttribute(
                this.eventLinks.nth(i),
                'href',
                /\/show_rating\/[^/]+/
            );
            await this.expectNotEmptyText(this.ratingMonths.nth(i));
            await this.expectText(this.ratingDays.nth(i), /^\d{1,2}$/);
            await this.expectText(
                this.ratingValues.nth(i),
                /^\s*(?:\d+(?:\.\d+)?|Insufficient ratings)\s*$/
            );
        }
    }

    async checkRating(index: number, expected: ExpectedRating) {
        await this.expectVisible(this.ratingRows.nth(index));
        await this.expectText(this.eventLinks.nth(index), expected.eventName);
        await this.expectText(this.ratingMonths.nth(index), expected.month);
        await this.expectText(this.ratingDays.nth(index), expected.day);
        await this.expectText(this.ratingValues.nth(index), expected.rating);

        if (expected.url !== undefined) {
            await this.expectAttribute(
                this.eventLinks.nth(index),
                'href',
                expected.url
            );
        }
    }

    async checkRatingsCount(expectedCount: number) {
        await this.expectCount(this.ratingRows, expectedCount);
    }

    async openEventRating(index = 0) {
        await this.expectVisible(this.eventLinks.nth(index));
        await this.click(this.eventLinks.nth(index));
    }

    async checkRatingsPage() {
        await this.expectTitle(this.expectedTitle);
        await this.expectVisible(this.heading);
        await this.expectText(
            this.heading,
            new RegExp(this.expectedHeading)
        );
        await this.checkYearNavigation();
        await this.checkRatingsContent();
    }
}
