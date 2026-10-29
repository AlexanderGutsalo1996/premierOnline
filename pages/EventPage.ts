
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class EventPage extends BasePage {
    readonly eventTitle: Locator;
    readonly breadcrumbTitle: Locator;
    readonly eventPrice: Locator;
    readonly registrationLinks: Locator;
    readonly introductionTab: Locator;
    readonly categoriesTab: Locator;
    readonly informationTab: Locator;
    readonly introductionContent: Locator;
    readonly categoriesContent: Locator;
    readonly informationContent: Locator;
    readonly categoryRows: Locator;
    readonly faqItems: Locator;
    readonly locationMap: Locator;
    readonly organiserName: Locator;
    readonly contactModal: Locator;
    readonly contactForm: Locator;
    readonly organiserQuestionButton: Locator;
    readonly fullNameInput: Locator;
    readonly emailInput: Locator;
    readonly phoneInput: Locator;
    readonly subjectInput: Locator;
    readonly messageInput: Locator;
    readonly submitButton: Locator;
    readonly resultsModal: Locator;
    readonly downloads: Locator;
    readonly downloadRows: Locator;

    constructor(page: Page) {
        super(page);

        this.eventTitle = page.locator('h2.dtl-title');
        this.breadcrumbTitle = page.locator('.e-current-page');
        this.eventPrice = page.locator('.dtl-title-sec .min_price');
        this.registrationLinks = page.locator('a.register-link');

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
        );

        this.faqItems = this.informationContent.locator(
            'ul[uk-accordion] > li'
        );

        this.locationMap = page.locator('.m-map iframe');
        this.organiserName = page.locator('.s-organiser h5 a');

        this.contactModal = page.locator('#organizer');
        this.contactForm = page.locator('#contact_organizer');

        this.organiserQuestionButton = this.contactForm.getByRole(
            'button',
            { name: /I have a question about the event itself/ }
        );

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

    async openEvent(slug: string) {
        await this.goto(`/event/${slug}`);
    }

    async checkEventTitle(expectedTitle: string) {
        await this.expectText(this.eventTitle, expectedTitle);
        await this.expectText(this.breadcrumbTitle, expectedTitle);
    }

    async checkEventPrice(expectedPrice: string) {
        await this.expectText(this.eventPrice, expectedPrice);
    }

    async checkRegistrationButton(expectedText: string) {
        await this.expectText(
            this.registrationLinks.first(),
            expectedText
        );
    }

    async checkRegistrationUrl(expectedUrl: string) {
        await this.expectAttribute(
            this.registrationLinks.first(),
            'href',
            expectedUrl
        );
    }

    async openIntroductionTab() {
        await this.click(this.introductionTab);
        await this.expectVisible(this.introductionContent);
    }

    async openCategoriesTab() {
        await this.click(this.categoriesTab);
        await this.expectVisible(this.categoriesContent);
    }

    async openInformationTab() {
        await this.click(this.informationTab);
        await this.expectVisible(this.informationContent);
    }

    async checkCategoryCount(expectedCount: number) {
        await this.openCategoriesTab();
        await this.expectCount(this.categoryRows, expectedCount);
    }

    async checkOrganiser(expectedName: string) {
        await this.expectText(this.organiserName, expectedName);
    }

    async checkOrganiserUrl(expectedUrl: string) {
        await this.expectAttribute(
            this.organiserName,
            'href',
            expectedUrl
        );
    }

    async checkLocationMap() {
        await this.expectVisible(this.locationMap);
        await this.expectAttribute(
            this.locationMap,
            'src',
            /google\.com\/maps\/embed/
        );
    }

    async checkContactForm() {
        // Contact modal must already be opened.
        await this.expectVisible(this.contactModal);
        await this.click(this.organiserQuestionButton);

        await this.expectVisible(this.fullNameInput);
        await this.expectVisible(this.emailInput);
        await this.expectVisible(this.messageInput);
        await this.expectVisible(this.submitButton);
    }

    async fillContactForm(
        fullName: string,
        email: string,
        phone: string,
        subject: string,
        message: string
    ) {
        await this.fill(this.fullNameInput, fullName);
        await this.fill(this.emailInput, email);
        await this.fill(this.phoneInput, phone);
        await this.fill(this.subjectInput, subject);
        await this.fill(this.messageInput, message);
    }

    async checkFaqCount(expectedCount: number) {
        await this.openInformationTab();
        await this.expectCount(this.faqItems, expectedCount);
    }

    async checkDownloadCount(expectedCount: number) {
        await this.expectCount(this.downloadRows, expectedCount);
    }

    async checkDownloads() {
        await this.expectVisible(this.downloads);
        await this.expectVisible(this.downloadRows.first());
    }

    async checkResultsModal() {
        await this.expectVisible(this.resultsModal);
    }

    async checkEventPage(expectedTitle: string) {
        await this.checkEventTitle(expectedTitle);

        await this.expectVisible(this.introductionTab);
        await this.expectVisible(this.categoriesTab);
        await this.expectVisible(this.informationTab);
        await this.expectVisible(this.organiserName);
    }
}
