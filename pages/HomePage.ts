
import { Page, Locator, expect } from '@playwright/test';

export class HomePage {
    readonly page: Page;
    readonly slider: Locator;
    readonly sliderItems: Locator;
    readonly searchForm: Locator;
    readonly sportSelect: Locator;
    readonly countrySelect: Locator;
    readonly searchButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.slider = this.page.locator('section.slider');
        this.sliderItems = this.slider.locator('.uk-slider-items > li');
        this.searchForm = this.page.locator('#search-form');
        this.sportSelect = this.searchForm.locator('#txt_cat');
        this.countrySelect = this.searchForm.locator('#txt_cnt');
        this.searchButton = this.searchForm.locator('button[type="submit"]');
    }
    async openHomePage() {
        await this.page.goto('/');
    }
    async verifyTitle() {
        await expect(this.page).toHaveTitle('Premier Online');
    }
    async checkSlider() {
        await expect(this.slider).toBeVisible();
        await expect(this.sliderItems.first()).toBeAttached();
    }

    async checkSearchForm() {
        await expect(this.searchForm).toBeVisible();
        await expect(this.sportSelect).toBeVisible();
        await expect(this.sportSelect).toHaveValue('0');
        await expect(this.countrySelect).toBeVisible();
        await expect(this.countrySelect).toHaveValue('0');
        await expect(this.searchButton).toBeVisible();
        await expect(this.searchButton).toHaveText('Search');
        await expect(this.searchButton).toHaveAttribute('type', 'submit');
    }
    async checkHomePageComponents() {
        await this.verifyTitle();
        await this.checkSlider();
        await this.checkSearchForm();
    }
}
