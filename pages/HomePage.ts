
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
    readonly expectedTitle = 'Premier Online - leading provider of online event registration for sports events';
    readonly expectedSportPlaceholder = 'Select Sport';
    readonly expectedCountryPlaceholder = 'Select Country';
    readonly expectedSearchButtonText = 'Search';

    readonly slider: Locator;
    readonly sliderItems: Locator;
    readonly sliderTitles: Locator;
    readonly sliderImages: Locator;
    readonly sliderDates: Locator;
    readonly sliderNavigation: Locator;
    readonly sliderNavigationItems: Locator;

    readonly searchForm: Locator;
    readonly sportSelect: Locator;
    readonly sportDefaultOption: Locator;
    readonly countrySelect: Locator;
    readonly countryDefaultOption: Locator;
    readonly searchButton: Locator;

    readonly upcomingEventsSection: Locator;
    readonly upcomingEventsHeading: Locator;
    readonly eventList: Locator;
    readonly eventCards: Locator;
    readonly eventCardTitles: Locator;
    readonly eventCardDates: Locator;
    readonly eventCardCountries: Locator;

    constructor(page: Page) {
        super(page);

        this.slider = page.locator('section.slider');
        this.sliderItems = this.slider.locator('.uk-slider-items > li');
        this.sliderTitles = this.sliderItems.locator('.uk-card-title a');
        this.sliderImages = this.sliderItems.locator('img');
        this.sliderDates = this.sliderItems.locator('.date');
        this.sliderNavigation = this.slider.locator('.uk-slider-nav');
        this.sliderNavigationItems = this.sliderNavigation.locator('[uk-slider-item]');

        this.searchForm = page.locator('#search-form');
        this.sportSelect = this.searchForm.locator('#txt_cat');
        this.sportDefaultOption = this.sportSelect.locator('option[value="0"]');
        this.countrySelect = this.searchForm.locator('#txt_cnt');
        this.countryDefaultOption = this.countrySelect.locator('option[value="0"]');
        this.searchButton = this.searchForm.locator('button[type="submit"]');

        this.upcomingEventsHeading = page.getByRole('heading', {
            name: 'Upcoming Events',
            exact: true
        });
        this.upcomingEventsSection = page.locator('section').filter({
            has: this.upcomingEventsHeading
        });
        this.eventList = this.upcomingEventsSection.locator('.events_flex');
        this.eventCards = this.eventList.locator('a.event');
        this.eventCardTitles = this.eventCards.locator('.uk-card-title');
        this.eventCardDates = this.eventCards.locator('.date');
        this.eventCardCountries = this.eventCards.locator('.counrty-name');
    }

    async openHomePage() {
        await this.goto('/');
    }

    async verifyTitle() {
        await this.expectTitle(this.expectedTitle);
    }

    async checkSlider() {
        await this.expectVisible(this.slider);
        await this.expectAttached(this.sliderItems.first());
        await this.expectNotEmptyText(this.sliderTitles.first());
        await this.expectAttribute(
            this.sliderTitles.first(),
            'href',
            /\/event\/[^/]+/
        );
        await this.expectAttribute(this.sliderImages.first(), 'src', /\S/);
        await this.expectNotEmptyText(this.sliderDates.first());
    }

    async checkSliderNavigation() {
        await this.expectAttached(this.sliderNavigation);
        await this.expectCount(
            this.sliderNavigationItems,
            await this.count(this.sliderItems)
        );
    }

    async checkSearchForm() {
        await this.expectVisible(this.searchForm);
        await this.expectVisible(this.sportSelect);
        await this.expectVisible(this.countrySelect);
        await this.expectEnabled(this.sportSelect);
        await this.expectEnabled(this.countrySelect);
        await this.expectText(this.sportDefaultOption, this.expectedSportPlaceholder);
        await this.expectText(this.countryDefaultOption, this.expectedCountryPlaceholder);
        await this.expectVisible(this.searchButton);
        await this.expectText(this.searchButton, this.expectedSearchButtonText);
    }

    async selectSport(value: string) {
        await this.actionAndWaitForResponse(
            'ajax_requests.php?request=getCountriesByCategory',
            () => this.selectOption(this.sportSelect, value)
        );
        await this.expectValue(this.sportSelect, value);
    }

    async selectCountry(value: string) {
        await this.actionAndWaitForResponse(
            'ajax_requests.php?request=getCategoryByCountriesId',
            () => this.selectOption(this.countrySelect, value)
        );
        await this.expectValue(this.countrySelect, value);
    }

    async submitSearch() {
        await this.click(this.searchButton);
    }

    async checkUpcomingEvents() {
        await this.expectVisible(this.upcomingEventsSection);
        await this.expectVisible(this.upcomingEventsHeading);
        await this.expectVisible(this.eventList);
        await this.expectVisible(this.eventCards.first());
    }

    async checkEventCards() {
        await this.expectVisible(this.eventCards.first());
        await this.expectAttribute(
            this.eventCards.first(),
            'href',
            /\/event\/[^/]+/
        );
        await this.expectNotEmptyText(this.eventCardTitles.first());
        await this.expectNotEmptyText(this.eventCardDates.first());
        await this.expectNotEmptyText(this.eventCardCountries.first());
    }

    async openEvent(index = 0) {
        await this.click(this.eventCards.nth(index));
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
