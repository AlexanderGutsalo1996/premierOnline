
import { Page, Locator, expect } from '@playwright/test';

export class EventPage {
    readonly page: Page;

    // Main event information
    readonly eventTitle: Locator;
    readonly breadcrumbTitle: Locator;
    readonly eventPrice: Locator;
    readonly eventDetails: Locator;
    readonly registrationLinks: Locator;

    // Rating and images
    readonly rating: Locator;
    readonly eventImages: Locator;

    // Tabs
    readonly introductionTab: Locator;
    readonly categoriesTab: Locator;
    readonly informationTab: Locator;

    readonly introductionContent: Locator;
    readonly categoriesContent: Locator;
    readonly informationContent: Locator;

    // Categories and FAQ
    readonly categoryRows: Locator;
    readonly faqItems: Locator;

    // Location and organiser
    readonly locationMap: Locator;
    readonly organiserName: Locator;

    // Contact form
    readonly contactModal: Locator;
    readonly contactForm: Locator;
    readonly organiserQuestionButton: Locator;
    readonly fullNameInput: Locator;
    readonly emailInput: Locator;
    readonly phoneInput: Locator;
    readonly subjectInput: Locator;
    readonly messageInput: Locator;
    readonly submitButton: Locator;

    // Results and downloads
    readonly resultsModal: Locator;
    readonly downloads: Locator;
    readonly downloadRows: Locator;

    constructor(page: Page) {
        this.page = page;

        this.eventTitle = page.locator('h2.dtl-title');
        this.breadcrumbTitle = page.locator('.e-current-page');
        this.eventPrice = page.locator('.dtl-title-sec .min_price');

        this.eventDetails = page.locator('.dtl-main-inner table')
            .first();

        this.registrationLinks = page.locator('a.register-link');

        this.rating = page.locator('.stars-review a');
        this.eventImages = page.locator(
            '.dtl-top-img-sec img'
        );

        this.introductionTab = page.locator(
            '.tab-menu a[data-rel="tab-1"]'
        );

        this.categoriesTab = page.locator(
            '.tab-menu a[data-rel="tab-2"]'
        );

        this.informationTab = page.locator(
            '.tab-menu a[data-rel="tab-3"]'
        );

        this.introductionContent = page.locator('#tab-1');
        this.categoriesContent = page.locator('#tab-2');
        this.informationContent = page.locator('#tab-3');

        this.categoryRows = this.categoriesContent.locator(
            '.tbl-cats tbody tr'
        ).filter({
            has: page.locator('td')
        });

        this.faqItems = this.informationContent.locator(
            'ul[uk-accordion] > li'
        );

        this.locationMap = page.locator('.m-map iframe');

        this.organiserName = page.locator(
            '.s-organiser h5 a'
        );

        this.contactModal = page.locator('#organizer');
        this.contactForm = page.locator('#contact_organizer');

        this.organiserQuestionButton = this.contactForm
            .getByRole('button', {
                name: /I have a question about the event itself/
            });

        this.fullNameInput = this.contactForm.locator('#full_name');
        this.emailInput = this.contactForm.locator('#email');
        this.phoneInput = this.contactForm.locator('#contact_number');
        this.subjectInput = this.contactForm.locator('#subject');

        this.messageInput = this.contactForm.locator(
            '#contact_organizer_message'
        );

        this.submitButton = this.contactForm.locator(
            '#contact_organizer_submit'
        );

        this.resultsModal = page.locator('#results');

        this.downloads = page.locator('.event-download');

        this.downloadRows = this.downloads.locator(
            '.download-box > .row'
        );
    }

    async openEvent(eventSlug: string) {
        await this.page.goto(`/event/${eventSlug}`);
    }

    async checkEventTitle(expectedTitle: string) {
        await expect(this.eventTitle).toHaveText(expectedTitle);
        await expect(this.breadcrumbTitle).toHaveText(expectedTitle);
    }

    async checkEventPrice(expectedPrice: string) {
        await expect(this.eventPrice).toHaveText(expectedPrice);
    }

    async checkEventDetail(
        field: 'City' | 'Date' | 'Time',
        expectedValue: string
    ) {
        const row = this.eventDetails.locator('tr').filter({
            has: this.page.locator('th', {
                hasText: new RegExp(`^${field}$`)
            })
        });

        await expect(row.locator('td')).toHaveText(expectedValue);
    }

    async checkRegistrationButton(expectedText: string) {
        await expect(
            this.registrationLinks.first()
        ).toHaveText(expectedText);
    }

    async checkRegistrationUrl(expectedUrl: string) {
        await expect(
            this.registrationLinks.first()
        ).toHaveAttribute('href', expectedUrl);
    }

    async checkRating(expectedText: string) {
        await expect(this.rating).toContainText(expectedText);
    }

    async checkEventImages(expectedCount: number) {
        await expect(this.eventImages).toHaveCount(expectedCount);

        for (const image of await this.eventImages.all()) {
            await expect(image).toHaveAttribute('src', /\S/);
        }
    }

    async openIntroductionTab() {
        await this.introductionTab.click();
        await expect(this.introductionContent).toBeVisible();
    }

    async openCategoriesTab() {
        await this.categoriesTab.click();
        await expect(this.categoriesContent).toBeVisible();
    }

    async openInformationTab() {
        await this.informationTab.click();
        await expect(this.informationContent).toBeVisible();
    }

    async checkCategoryCount(expectedCount: number) {
        await this.openCategoriesTab();
        await expect(this.categoryRows).toHaveCount(expectedCount);
    }

    async checkCategory(
        index: number,
        expectedName: string,
        expectedPrice: string
    ) {
        await this.openCategoriesTab();

        const row = this.categoryRows.nth(index);

        await expect(row.locator('td').first())
            .toContainText(expectedName);

        await expect(row.locator('td').last())
            .toHaveText(expectedPrice);
    }

    async checkFaqCount(expectedCount: number) {
        await this.openInformationTab();
        await expect(this.faqItems).toHaveCount(expectedCount);
    }

    async openFaqQuestion(expectedQuestion: string) {
        await this.openInformationTab();

        const item = this.faqItems.filter({
            has: this.page.locator('.uk-accordion-title', {
                hasText: expectedQuestion
            })
        });

        const question = item.locator('.uk-accordion-title');
        const answer = item.locator('.uk-accordion-content');

        await expect(question).toHaveText(expectedQuestion);

        if (!(await answer.isVisible())) {
            await question.click();
        }

        await expect(answer).toBeVisible();
    }

    async checkFaqAnswer(
        expectedQuestion: string,
        expectedAnswer: string
    ) {
        await this.openFaqQuestion(expectedQuestion);

        const item = this.faqItems.filter({
            has: this.page.locator('.uk-accordion-title', {
                hasText: expectedQuestion
            })
        });

        await expect(
            item.locator('.uk-accordion-content')
        ).toContainText(expectedAnswer);
    }

    async checkLocationMap() {
        await expect(this.locationMap).toBeVisible();

        await expect(this.locationMap).toHaveAttribute(
            'src',
            /google\.com\/maps\/embed/
        );
    }

    async checkOrganiser(expectedName: string) {
        await expect(this.organiserName).toHaveText(expectedName);
    }

    async checkOrganiserUrl(expectedUrl: string) {
        await expect(this.organiserName).toHaveAttribute(
            'href',
            expectedUrl
        );
    }

    async checkContactForm() {
        await expect(this.contactModal).toBeVisible();

        await this.organiserQuestionButton.click();

        await expect(this.fullNameInput).toBeVisible();
        await expect(this.emailInput).toBeVisible();
        await expect(this.phoneInput).toBeVisible();
        await expect(this.subjectInput).toBeVisible();
        await expect(this.messageInput).toBeVisible();
        await expect(this.submitButton).toBeVisible();
    }

    async fillContactForm(
        fullName: string,
        email: string,
        phone: string,
        subject: string,
        message: string
    ) {
        await this.fullNameInput.fill(fullName);
        await this.emailInput.fill(email);
        await this.phoneInput.fill(phone);
        await this.subjectInput.fill(subject);
        await this.messageInput.fill(message);
    }

    async checkResultsMessage(expectedMessage: string) {
        await expect(this.resultsModal).toBeVisible();

        await expect(
            this.resultsModal.locator('.uk-modal-body')
        ).toContainText(expectedMessage);
    }

    async checkDownloadCount(expectedCount: number) {
        await expect(this.downloadRows).toHaveCount(expectedCount);
    }

    async checkDownload(
        index: number,
        expectedFilename: string
    ) {
        const row = this.downloadRows.nth(index);

        await expect(
            row.locator('.file-name')
        ).toHaveText(expectedFilename);

        await expect(
            row.locator('.download-icon a')
        ).toHaveAttribute(
            'href',
            /\/action\/download\.php/
        );
    }

    async checkEventPage(expectedTitle: string) {
        await expect(this.eventTitle).toBeVisible();

        await this.checkEventTitle(expectedTitle);

        await expect(this.introductionTab).toBeVisible();
        await expect(this.categoriesTab).toBeVisible();
        await expect(this.informationTab).toBeVisible();

        await expect(this.organiserName).toBeVisible();
    }
}
