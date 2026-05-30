import * as cheerio from 'cheerio';
import { fetchPageHtml, assertUrlIsFetchable, BROWSER_UA } from './fetch-page';

export interface PageMetadata {
  url: string;
  title: string;
  image: string | null;
}

/** Carries an HTTP status so route handlers can map failures to a response. */
export class MetadataError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'MetadataError';
  }
}

/** Validate that a URL is a well-formed http(s) URL; throws MetadataError(400). */
export function assertHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MetadataError('Invalid URL', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MetadataError('Only http(s) URLs are supported', 400);
  }
  return parsed;
}

/**
 * Fetches a page and extracts a title + best available preview image.
 * Tries a plain fetch first and falls back to headless Chromium when the site
 * blocks bots or serves an anti-bot challenge. Throws MetadataError on failure.
 */
export async function extractMetadata(url: string): Promise<PageMetadata> {
  let html: string;
  try {
    html = await fetchPageHtml(url);
  } catch (err) {
    throw new MetadataError(
      `Cannot fetch URL: ${err instanceof Error ? err.message : 'Network error'}`,
      502
    );
  }

  const $ = cheerio.load(html);

  // Title — first non-empty among these sources.
  const title = (
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('meta[itemprop="name"]').attr('content') ||
    $('meta[name="title"]').attr('content') ||
    $('meta[name="DC.title"]').attr('content') ||
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    ''
  ).trim();

  const makeAbsoluteUrl = (imageUrl: string, baseUrl: string): string => {
    if (!imageUrl || imageUrl.startsWith('http')) return imageUrl;
    try {
      const urlObj = new URL(baseUrl);
      if (imageUrl.startsWith('//')) return urlObj.protocol + imageUrl;
      if (imageUrl.startsWith('/')) return urlObj.origin + imageUrl;
      return urlObj.origin + '/' + imageUrl;
    } catch {
      return imageUrl;
    }
  };

  const isImageAccessible = async (imageUrl: string): Promise<boolean> => {
    try {
      await assertUrlIsFetchable(imageUrl);
      const res = await fetch(imageUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,*/*;q=0.8' },
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const extractImageFromStyles = (): string => {
    let styleImage = '';
    $('[style*="background"]').each((_, element) => {
      const style = $(element).attr('style') || '';
      const m = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
      if (m && m[1]) {
        styleImage = m[1];
        return false;
      }
    });
    return styleImage;
  };

  const findImageUrlInHtml = (): string => {
    const matches =
      html.match(
        /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg))(?:[?#][^\s"'<>]*)?/gi
      ) || [];
    if (matches.length > 0) {
      const filtered = matches.filter((u) => {
        const l = u.toLowerCase();
        return (
          !l.includes('icon') &&
          !l.includes('logo') &&
          !l.includes('avatar') &&
          !l.includes('sprite') &&
          !l.includes('1x1') &&
          !l.includes('pixel')
        );
      });
      return filtered[0] ?? matches[0] ?? '';
    }
    return '';
  };

  let image =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[property="og:image:secure_url"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('meta[name="twitter:image:src"]').attr('content') ||
    $('link[rel="image_src"]').attr('href') ||
    $('meta[property="thumbnailUrl"]').attr('content') ||
    $('meta[name="thumbnailUrl"]').attr('content') ||
    $('meta[itemprop="thumbnailUrl"]').attr('content') ||
    $('meta[itemprop="image"]').attr('content') ||
    $('meta[name="msapplication-TileImage"]').attr('content') ||
    '';

  if (image) {
    image = makeAbsoluteUrl(image, url);
    if (!(await isImageAccessible(image))) {
      const styleImage = extractImageFromStyles();
      if (styleImage) {
        image = makeAbsoluteUrl(styleImage, url);
      } else {
        const firstImg = $('img').first().attr('src') || '';
        image = firstImg ? makeAbsoluteUrl(firstImg, url) : findImageUrlInHtml();
      }
    }
  } else {
    const styleImage = extractImageFromStyles();
    if (styleImage) {
      image = makeAbsoluteUrl(styleImage, url);
    } else {
      const firstImg = $('img').first().attr('src') || '';
      image = firstImg ? makeAbsoluteUrl(firstImg, url) : findImageUrlInHtml();
    }
  }

  return { url, title, image: image || null };
}
