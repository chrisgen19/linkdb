import { chromium, type Browser } from 'playwright';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Detects anti-bot interstitial pages (Cloudflare "Just a moment…", etc.) that
 * are returned in place of the real content and require JS execution to clear.
 */
function looksLikeChallenge(html: string): boolean {
  // Match the interstitial itself, not the `challenge-platform` script tag that
  // Cloudflare leaves embedded on every page even after the challenge clears.
  return /<title>\s*just a moment|checking your browser before accessing|cf-browser-verification|please enable javascript and cookies to continue/i.test(
    html
  );
}

/**
 * Renders a page with headless Chromium so JS-based anti-bot challenges
 * (e.g. Cloudflare) can resolve, then returns the final HTML.
 */
async function fetchWithBrowser(url: string): Promise<string> {
  let browser: Browser | null = null;
  try {
    // --no-sandbox is required when Chromium runs as root inside a container
    // (e.g. the Playwright Docker image); it's harmless in local dev.
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Give a Cloudflare challenge time to solve and redirect to real content.
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    let html = await page.content();
    if (looksLikeChallenge(html)) {
      // Challenge still up — wait a bit longer for the auto-redirect.
      await page.waitForTimeout(6000);
      html = await page.content();
    }
    return html;
  } finally {
    await browser?.close();
  }
}

/**
 * Fetches a page's HTML. Tries a plain fetch first (fast); if the site blocks
 * it or returns an anti-bot challenge page, falls back to headless Chromium.
 */
export async function fetchPageHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (res.ok) {
      const html = await res.text();
      if (!looksLikeChallenge(html)) {
        return html;
      }
    }
  } catch {
    // Network-level failure — fall through to the browser path.
  }

  return fetchWithBrowser(url);
}
