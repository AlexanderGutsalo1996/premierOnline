
import { Page, Locator, expect } from '@playwright/test';

export class HelpChatComponents {
    readonly page: Page;
    readonly chatFrame: Locator;
    readonly chatButton: Locator;
    readonly helpDialog: Locator;
    readonly closeButton: Locator;

    readonly chatHeading: Locator;
    readonly supportChannels: Locator;

    readonly faqHeading: Locator;
    readonly faqCategories: Locator;
    readonly faqArticles: Locator;
    readonly articleTitle: Locator;
    readonly articleBody: Locator;

    readonly searchFaqButton: Locator;
    readonly faqSearchInput: Locator;
    readonly backButton: Locator;

    constructor(page: Page) {
        this.page = page;

        // Main Freshchat container
        this.chatFrame = page.locator('#fc_frame');

        // Elements inside Freshchat iframe
        const widget = page.frameLocator('#fc_widget');

        this.chatButton = widget.locator(
            'div.d-hotline[aria-label="Open chat"]'
        );

        this.helpDialog = widget.getByRole('dialog', {
            name: 'Freshchat',
            exact: true
        });

        this.closeButton = widget.getByRole('button', {
            name: 'Close widget',
            exact: true
        });

        // Support channels
        this.chatHeading = widget.getByRole('heading', {
            name: 'Chat with us',
            exact: true
        });

        this.supportChannels = widget.locator('a.channel-link');

        // FAQ
        this.faqHeading = widget.getByRole('heading', {
            name: 'FAQs',
            exact: true
        });

        this.faqCategories = widget.locator('a.category-link');

        this.faqArticles = widget.locator(
            'li.article[role="link"]'
        );

        this.articleTitle = widget.locator('#faq-article-title');

        this.articleBody = widget.locator(
            '#faq-article-content-body'
        );

        // FAQ search and navigation
        this.searchFaqButton = widget.getByRole('button', {
            name: 'Search Frequently Asked Questions',
            exact: true
        });

        this.faqSearchInput = widget.locator('#faq-search-input');

        this.backButton = widget.getByRole('button', {
            name: 'Back',
            exact: true
        });
    }

    async checkChatButton() {
        await expect(this.chatButton).toBeVisible();

        await expect(this.chatButton).toHaveAttribute(
            'role',
            'button'
        );

        await expect(this.chatButton).toHaveAttribute(
            'aria-label',
            'Open chat'
        );
    }

    async openChat() {
        await this.chatButton.click();
        await this.checkChatOpened();
    }

    async checkChatOpened() {
        await expect(this.chatFrame).toHaveClass(/\bfc-open\b/);
        await expect(this.helpDialog).toBeVisible();
        await expect(this.closeButton).toBeVisible();
    }

    async checkChatClosed() {
        await expect(this.chatFrame).not.toHaveClass(/\bfc-open\b/);
    }

    async closeChat() {
        await this.closeButton.click();
        await this.checkChatClosed();
    }

    async checkSupportChannels(
        expectedCount?: number
    ) {
        await expect(this.chatHeading).toBeVisible();

        if (expectedCount !== undefined) {
            await expect(this.supportChannels).toHaveCount(
                expectedCount
            );
        } else {
            await expect(this.supportChannels.first()).toBeVisible();
        }
    }

    async checkSupportChannel(
        index: number,
        expectedName: string,
        expectedHref?: string
    ) {
        const channel = this.supportChannels.nth(index);

        await expect(channel).toBeVisible();

        await expect(
            channel.locator('.channel-name')
        ).toHaveText(expectedName);

        if (expectedHref !== undefined) {
            await expect(channel).toHaveAttribute(
                'href',
                expectedHref
            );
        }
    }

    async openSupportChannel(index: number) {
        await this.supportChannels.nth(index).click();
    }

    async checkFaqCategories(
        expectedCount?: number
    ) {
        await expect(this.faqHeading).toBeVisible();

        if (expectedCount !== undefined) {
            await expect(this.faqCategories).toHaveCount(
                expectedCount
            );
        } else {
            await expect(this.faqCategories.first()).toBeVisible();
        }
    }

    async checkFaqCategory(
        index: number,
        expectedName: string
    ) {
        await expect(
            this.faqCategories.nth(index)
        ).toHaveText(expectedName);
    }

    async openFaqCategory(index: number) {
        await this.faqCategories.nth(index).click();

        await expect(this.backButton).toBeVisible();
    }

    async checkFaqArticles(
        expectedCount?: number
    ) {
        if (expectedCount !== undefined) {
            await expect(this.faqArticles).toHaveCount(
                expectedCount
            );
        } else {
            await expect(this.faqArticles.first()).toBeVisible();
        }
    }

    async checkFaqArticle(
        index: number,
        expectedTitle: string
    ) {
        await expect(
            this.faqArticles.nth(index)
        ).toHaveText(expectedTitle);
    }

    async openFaqArticle(
        index: number,
        expectedTitle: string
    ) {
        await this.faqArticles.nth(index).click();

        await expect(this.articleTitle).toHaveText(
            expectedTitle
        );

        await expect(this.articleBody).toBeVisible();
        await expect(this.articleBody).toHaveText(/\S/);
    }

    async openFaqSearch() {
        await this.searchFaqButton.click();

        await expect(this.faqSearchInput).toBeVisible();
        await expect(this.faqSearchInput).toBeEditable();

        await expect(this.faqSearchInput).toHaveAttribute(
            'placeholder',
            'Search for Answers'
        );
    }

    async searchFaqs(query: string) {
        await this.faqSearchInput.fill(query);

        await expect(this.faqSearchInput).toHaveValue(query);
    }

    async checkFaqSearchValue(expectedQuery: string) {
        await expect(this.faqSearchInput).toHaveValue(
            expectedQuery
        );
    }

    async goBack() {
        await this.backButton.click();
    }
}
