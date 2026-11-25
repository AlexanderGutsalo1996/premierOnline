// Single code location of the default site URL.
export const DEFAULT_BASE_URL = 'https://www.premieronline.com';

// Lazy getters: evaluated after .env.local has been loaded.
export const getBaseUrl = () => process.env.BASE_URL || DEFAULT_BASE_URL; // `||` ignores empty strings

// Absolute URL of a site path, without a trailing slash for the root: siteUrl() / siteUrl('/help').
export const siteUrl = (path = '') => `${getBaseUrl().replace(/\/+$/, '')}${path}`;

// Matches the site root URL with or without a trailing slash.
export const siteRootPattern = () => new RegExp(`^${siteUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`);

// Credentials of the real account used by the positive login test: from .env.local or CI secrets only.
export function getLoginCredentials(): { email: string; password: string } {
  const email = process.env.LOGIN_EMAIL;
  const password = process.env.LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error('LOGIN_EMAIL and LOGIN_PASSWORD must be set in .env.local (or as CI secrets)');
  }
  return { email, password };
}
