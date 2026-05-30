import { chromium, type Browser } from 'playwright';
import { promises as dns } from 'dns';
import net from 'net';

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PAGE_FETCH_TIMEOUT_MS = 10_000;

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

function ipv4ToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  const inRange = (base: string, bits: number): boolean => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (ipv4ToLong(base) & mask);
  };
  return (
    inRange('0.0.0.0', 8) || // "this" network
    inRange('10.0.0.0', 8) || // private
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    inRange('172.16.0.0', 12) || // private
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.168.0.0', 16) || // private
    inRange('198.18.0.0', 15) || // benchmarking
    inRange('224.0.0.0', 4) || // multicast
    inRange('240.0.0.0', 4) // reserved
  );
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isBlockedIPv4(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // link-local fe80::/10
  return false;
}

function isBlockedIp(ip: string): boolean {
  return net.isIPv4(ip) ? isBlockedIPv4(ip) : isBlockedIPv6(ip);
}

/**
 * Guards against SSRF: rejects non-http(s) URLs and any host that resolves to a
 * private, loopback, link-local, or cloud-metadata address. Throws on a blocked
 * URL. Note: this checks the initial host only — redirects are still followed,
 * so a determined redirect to an internal address remains a residual risk.
 */
export async function assertUrlIsFetchable(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }

  const { hostname } = parsed;
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error('URL resolves to a blocked address');
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new Error('Could not resolve host');
  for (const { address } of records) {
    if (isBlockedIp(address)) {
      throw new Error('URL resolves to a blocked address');
    }
  }
}

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
  await assertUrlIsFetchable(url);

  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
    });
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
