
import { Page, Locator, expect } from '@playwright/test';

export class HomePage {
    readonly page: Page;
    readonly slider: Locator;
    readonly sliderItems: Locator;
    readonly searchForm: Locator;
    readonly sportSelect: Locator;
    readonly countrySelect: Locator;
    readonly searchButton: Locator;
    readonly sliderNavigation: Locator;
    readonly sliderNavigationItems: Locator;
    readonly upcomingEventsSection: Locator;
    readonly upcomingEventsHeading: Locator;
    readonly eventList: Locator;
    readonly eventCards: Locator;

    constructor(page: Page) {
        this.page = page;
        this.slider = this.page.locator('section.slider');
        this.sliderItems = this.slider.locator('.uk-slider-items > li');
        this.searchForm = this.page.locator('#search-form');
        this.sportSelect = this.searchForm.locator('#txt_cat');
        this.countrySelect = this.searchForm.locator('#txt_cnt');
        this.searchButton = this.searchForm.locator('button[type="submit"]');
        this.sliderNavigation = this.slider.locator('.uk-slider-nav');
        this.sliderNavigationItems = this.sliderNavigation.locator('[uk-slider-item]');
        this.upcomingEventsHeading = this.page.getByRole('heading', { name: 'Upcoming Events', exact: true });
        this.upcomingEventsSection = this.page.locator('section').filter({ has: this.upcomingEventsHeading });
        this.eventList = this.upcomingEventsSection.locator('.events_flex');
        this.eventCards = this.eventList.locator('a.event');
    }
    async openHomePage() {
        await this.page.goto('/');
    }
    async verifyTitle() {
        await expect(this.page).toHaveTitle('Premier Online - leading provider of online event registration for sports events');
    }
    async checkSlider() {
        await expect(this.slider).toBeVisible();
        await expect(this.sliderItems.first()).toBeAttached();
        for (let index = 0; index < await this.sliderItems.count(); index++) {
            const slide = this.sliderItems.nth(index);
            await expect(slide.locator('.uk-card-title a')).toHaveText(/\S/);
            await expect(slide.locator('.uk-card-title a')).toHaveAttribute('href', /\/event\/[^/]+/);
            await expect(slide.locator('img')).toHaveAttribute('src', /\S/);
            await expect(slide.locator('img')).toHaveAttribute('alt', /\S/);
            await expect(slide.locator('.date')).toHaveText(/\S/);
            // Registration availability can vary between featured events.
            for (const link of await slide.getByRole('link', { name: 'Register', exact: true }).all()) {
                await expect(link).toHaveAttribute('href', /\/register_event\.php\?id=\d+/);
            }
        }
    }

    async checkSliderNavigation() {
        // UIkit hides the navigation when there is only one slide.
        await expect(this.sliderNavigation).toBeAttached();
        await expect(this.sliderNavigationItems).toHaveCount(await this.sliderItems.count());
        if (await this.sliderItems.count() > 1) {
            await expect(this.sliderNavigation).toBeVisible();
            for (const item of await this.sliderNavigationItems.all()) {
                await expect(item.locator('a')).toBeVisible();
                await expect(item.locator('a')).toHaveAttribute('href', '#');
            }
        }
    }

    async checkSearchForm() {
        await expect(this.searchForm).toBeVisible();
        await expect(this.searchForm).toHaveAttribute('method', 'post');
        await expect(this.sportSelect).toBeVisible();
        await expect(this.sportSelect).toBeEnabled();
        await expect(this.sportSelect).toHaveAttribute('name', 'txt_cat');
        await expect(this.sportSelect).toHaveValue('0');
        await expect(this.sportSelect.locator('option[value="0"]')).toHaveText('Select Sport');
        await expect(this.countrySelect).toBeVisible();
        await expect(this.countrySelect).toBeEnabled();
        await expect(this.countrySelect).toHaveAttribute('name', 'txt_cnt');
        await expect(this.countrySelect).toHaveValue('0');
        await expect(this.countrySelect.locator('option[value="0"]')).toHaveText('Select Country');
        await expect(this.searchButton).toBeVisible();
        await expect(this.searchButton).toBeEnabled();
        await expect(this.searchButton).toHaveText('Search');
        await expect(this.searchButton).toHaveAttribute('type', 'submit');
    }

    async checkUpcomingEvents() {
        await expect(this.upcomingEventsSection).toBeVisible();
        await expect(this.upcomingEventsHeading).toBeVisible();
        await expect(this.eventList).toBeVisible();
        await expect(this.eventCards.first()).toBeVisible();
    }

    async checkEventCards() {
        await expect(this.eventCards.first()).toBeAttached();
        for (let index = 0; index < await this.eventCards.count(); index++) {
            const card = this.eventCards.nth(index);
            const image = card.locator('.uk-card-media-top > img');
            await expect(card).toBeVisible();
            await expect(card).toHaveAttribute('href', /\/event\/[^/]+/);
            await expect(image).toBeVisible();
            await expect(image).toHaveAttribute('src', /\S/);
            await expect(image).toHaveAttribute('alt', /\S/);
            for (const element of [card.locator('.uk-card-title'), card.locator('.date'),
                card.locator('.counrty-name'), card.locator('.uk-card-btn')]) {
                await expect(element).toBeVisible();
                await expect(element).toHaveText(/\S/);
            }
            // Status badges and organiser logos are optional.
            for (const badge of await card.locator('.uk-label').all()) {
                await expect(badge).toBeVisible();
                await expect(badge).toHaveText(/\S/);
            }
            for (const logo of await card.locator('.o-d-logo img').all()) {
                await expect(logo).toBeVisible();
                await expect(logo).toHaveAttribute('src', /\S/);
            }
        }
    }

    async selectSport(value: string) {
        const response = this.page.waitForResponse(response =>
            response.url().includes('ajax_requests.php?request=getCountriesByCategory')
        );
        await this.sportSelect.selectOption(value);
        await response;
        await expect(this.sportSelect).toHaveValue(value);
    }

    async selectCountry(value: string) {
        const response = this.page.waitForResponse(response =>
            response.url().includes('ajax_requests.php?request=getCategoryByCountriesId')
        );
        await this.countrySelect.selectOption(value);
        await response;
        await expect(this.countrySelect).toHaveValue(value);
    }

    async submitSearch() {
        await this.searchButton.click();
    }

    async openEvent(index = 0) {
        await this.eventCards.nth(index).click();
    }
    async checkHomePageComponents() {
        await this.verifyTitle();
        await this.checkSlider();
        await this.checkSliderNavigation();
        await this.checkSearchForm();
        await this.checkUpcomingEvents();
        await this.checkEventCards();
    }
}
