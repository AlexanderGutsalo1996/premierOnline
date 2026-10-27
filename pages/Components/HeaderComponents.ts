import {Page,Locator,expect} from "@playwright/test"
export class HeaderComponents {
readonly page:Page;
readonly logolink:Locator;
readonly logoimg:Locator;
readonly searchinput:Locator;
readonly navmenu:Locator;
readonly events:Locator;
readonly ratings:Locator;
readonly help:Locator;
readonly arabic:Locator;
readonly english:Locator;
readonly signIn:Locator;
readonly createAccount:Locator;

constructor (page:Page){
    this.page=page;
    this.logolink=this.page.locator('.uk-logo');
    this.logoimg=this.logolink.locator('img');
    this.searchinput=this.page.locator('#search');
    this.navmenu=this.page.locator('ul.uk-navbar-nav.uk-visible\\@m');
    this.events=this.navmenu.locator('a[href*="/calendar"]');
    this.ratings=this.navmenu.locator('a[href*="/event_ratings.php"]');
    this.help=this.navmenu.locator('a[href*="/help"]');
    this.arabic=this.navmenu.locator('a[href*="lang=ar"]'); 
    this.english=this.navmenu.locator('a[href*="lang=en"]');
    this.signIn=this.page.locator('.uk-button-secondary').first();
    this.createAccount=this.page.locator('.uk-sticky .uk-button-primary').first();
}
async checkLogoLink(){
    await expect(this.logolink).toBeVisible();
    await expect(this.logolink).toHaveAttribute('href', 'https://www.premieronline.com');
}
async checkLogoImg(){
    await expect(this.logoimg).toBeVisible();
    await expect(this.logoimg).toHaveAttribute(
        'src',
        'https://www.premieronline.com/assets/img/logo.svg');
}
async checkSearchInput(){
    await expect(this.searchinput).toBeVisible();
    await expect(this.searchinput).toHaveAttribute('placeholder', 'Search by Event Name or Organiser');
    await expect(this.searchinput).toHaveAttribute('type', 'search');
}
async checkNavMenu(){
    await expect(this.navmenu).toBeVisible();
    await expect(this.events).toBeVisible();
    await expect(this.ratings).toBeVisible();
    await expect(this.help).toBeVisible();
    await expect(this.arabic).toBeVisible();
    //зробити окремий метод await expect(this.english).toBeVisible();
}
async checkSignInButton(){
    await expect(this.signIn).toBeVisible();
    await expect(this.signIn).toHaveText('Sign in');
}
async checkCreateAccountButton(){
    await expect(this.createAccount).toBeVisible();
    await expect(this.createAccount).toHaveText('Create Account');
}
async checkHeaderComponents(){
    await this.checkLogoLink();
    await this.checkSearchInput();
    await this.checkNavMenu();
    await this.checkSignInButton();
    await this.checkCreateAccountButton();
}
}