// URL helpers shared by the add-link form (client) and the link API routes.

const SCHEME_WITH_SLASHES = /^[a-z][a-z\d+.-]*:\/\//i;
// A scheme like `javascript:` or `mailto:`, but not a host:port like `example.com:8080`.
const SCHEME_WITHOUT_SLASHES = /^[a-z][a-z\d+.-]*:(?!\d)/i;

/**
 * Parses an http(s) URL and returns its normalized form (lowercase scheme and
 * host, default port dropped, `/` path for a bare domain), or null otherwise.
 */
export function normalizeHttpUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.hostname ? parsed.href : null;
}

/**
 * Turns what the user typed into a normalized http(s) URL, adding `https://`
 * to a bare address like `www.example.com/page`. Returns null if it isn't one.
 */
export function parseUserUrl(raw: string): string | null {
  const value = raw.trim();
  const hasScheme = SCHEME_WITH_SLASHES.test(value) || SCHEME_WITHOUT_SLASHES.test(value);
  if (hasScheme) return normalizeHttpUrl(value);

  const href = normalizeHttpUrl(`https://${value.replace(/^\/\//, '')}`);
  // A bare word like "hello" would become https://hello/, which is almost always a typo.
  return href && new URL(href).hostname.includes('.') ? href : null;
}

const CLOSING_TO_OPENING: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Drops sentence punctuation glued to the end of a link, including an unmatched
 * closing bracket as in "(see https://x.com)", but keeps balanced ones like
 * `wiki/Mercury_(planet)`.
 */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    const opening = CLOSING_TO_OPENING[char];
    if (opening) {
      const head = url.slice(0, end);
      if (head.split(char).length <= head.split(opening).length) break;
    } else if (!'.,;:!?'.includes(char)) {
      break;
    }
    end--;
  }
  return url.slice(0, end);
}

/**
 * Finds a link in copied text: the whole text if it's an http(s) URL, else the
 * first http(s) URL inside it (share sheets often copy "Title https://…").
 * Requires an explicit scheme so plain text like "file.txt" isn't a match.
 */
export function findUrlInText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? normalizeHttpUrl(trimTrailingPunctuation(match[0])) : null;
}

/**
 * Spellings that count as the same saved link: the raw input (rows saved before
 * URLs were normalized), the normalized URL, and the same URL with the trailing
 * slash toggled (`/page` vs `/page/`, `example.com` vs `example.com/`).
 */
export function duplicateUrlCandidates(raw: string, href: string): string[] {
  const { origin, pathname, search, hash, username, password } = new URL(href);
  const candidates = [raw.trim(), href];
  if (!username && !password) {
    const toggled =
      pathname === '/' ? '' : pathname.endsWith('/') ? pathname.slice(0, -1) : `${pathname}/`;
    candidates.push(`${origin}${toggled}${search}${hash}`);
  }
  return Array.from(new Set(candidates));
}
