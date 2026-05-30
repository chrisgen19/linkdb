import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import * as cheerio from 'cheerio';
import { authOptions } from '@/lib/auth';
import { fetchPageHtml, assertUrlIsFetchable, BROWSER_UA } from '@/lib/fetch-page';

// Playwright requires the Node.js runtime, and the headless-browser fallback
// can take a while when solving anti-bot challenges.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let url = '';
  try {
    // Require auth: the headless-browser fallback is expensive, so gate it
    // behind a session to avoid an unauthenticated CPU/memory DoS vector.
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    url = body.url;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL and restrict to http(s) so unsupported schemes surface as a
    // 400 to the client instead of being silently saved.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json(
        { error: 'Only http(s) URLs are supported' },
        { status: 400 }
      );
    }

    // Fetch the page HTML. Tries a plain fetch first and falls back to headless
    // Chromium when the site blocks bots or serves an anti-bot challenge.
    let html: string;
    try {
      html = await fetchPageHtml(url);
    } catch (fetchError) {
      console.error(
        `[Metadata] Fetch failed for ${url}:`,
        fetchError instanceof Error ? fetchError.message : fetchError
      );
      return NextResponse.json(
        { error: `Cannot fetch URL: ${fetchError instanceof Error ? fetchError.message : 'Network error'}` },
        { status: 502 }
      );
    }

    let $;
    try {
      $ = cheerio.load(html);
    } catch (cheerioError) {
      console.error(
        `[Metadata] Failed to parse HTML for ${url}:`,
        cheerioError instanceof Error ? cheerioError.message : cheerioError
      );
      return NextResponse.json({ error: 'Failed to parse HTML' }, { status: 500 });
    }

    // Extract title from multiple sources
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';
    const schemaName = $('meta[itemprop="name"]').attr('content') || '';
    const metaTitle = $('meta[name="title"]').attr('content') || '';
    const dcTitle = $('meta[name="DC.title"]').attr('content') || '';
    const h1Title = $('h1').first().text().trim() || '';
    const htmlTitle = $('title').text().trim() || '';

    const title =
      ogTitle || twitterTitle || schemaName || metaTitle || dcTitle || htmlTitle || h1Title || '';

    // Helper function to make URLs absolute
    const makeAbsoluteUrl = (imageUrl: string, baseUrl: string): string => {
      if (!imageUrl || imageUrl.startsWith('http')) {
        return imageUrl;
      }

      try {
        const urlObj = new URL(baseUrl);
        if (imageUrl.startsWith('//')) {
          return urlObj.protocol + imageUrl;
        }
        if (imageUrl.startsWith('/')) {
          return urlObj.origin + imageUrl;
        }
        return urlObj.origin + '/' + imageUrl;
      } catch (error) {
        console.error(
          '[Metadata] Error converting URL to absolute:',
          error instanceof Error ? error.message : error
        );
        return imageUrl;
      }
    };

    // Helper function to check if image URL is accessible
    const isImageAccessible = async (imageUrl: string): Promise<boolean> => {
      try {
        await assertUrlIsFetchable(imageUrl);
        const imgResponse = await fetch(imageUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'image/avif,image/webp,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(5_000),
        });
        return imgResponse.ok;
      } catch (error) {
        console.error(
          `[Metadata] Error checking image accessibility ${imageUrl}:`,
          error instanceof Error ? error.message : error
        );
        return false;
      }
    };

    // Helper function to extract image from inline styles
    const extractImageFromStyles = (): string => {
      let styleImage = '';
      $('[style*="background"]').each((_, element) => {
        const style = $(element).attr('style') || '';
        const urlMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          styleImage = urlMatch[1];
          return false; // Break the loop
        }
      });
      return styleImage;
    };

    // Helper function to find any image URL in the entire HTML content
    const findImageUrlInHtml = (): string => {
      // Match http(s):// URLs ending with image extensions
      const matches =
        html.match(
          /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg))(?:[?#][^\s"'<>]*)?/gi
        ) || [];

      if (matches.length > 0) {
        // Filter out common small/icon images
        const filtered = matches.filter((url) => {
          const lowerUrl = url.toLowerCase();
          return (
            !lowerUrl.includes('icon') &&
            !lowerUrl.includes('logo') &&
            !lowerUrl.includes('avatar') &&
            !lowerUrl.includes('sprite') &&
            !lowerUrl.includes('1x1') &&
            !lowerUrl.includes('pixel')
          );
        });
        return filtered[0] ?? matches[0] ?? '';
      }
      return '';
    };

    // Extract all possible image sources
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogImageSecure = $('meta[property="og:image:secure_url"]').attr('content') || '';
    const twitterImage = $('meta[name="twitter:image"]').attr('content') || '';
    const twitterImageSrc = $('meta[name="twitter:image:src"]').attr('content') || '';
    const linkImage = $('link[rel="image_src"]').attr('href') || '';
    const thumbnailUrl =
      $('meta[property="thumbnailUrl"]').attr('content') ||
      $('meta[name="thumbnailUrl"]').attr('content') ||
      $('meta[itemprop="thumbnailUrl"]').attr('content') ||
      '';
    const schemaImage = $('meta[itemprop="image"]').attr('content') || '';
    const msImage = $('meta[name="msapplication-TileImage"]').attr('content') || '';

    let image =
      ogImage ||
      ogImageSecure ||
      twitterImage ||
      twitterImageSrc ||
      linkImage ||
      thumbnailUrl ||
      schemaImage ||
      msImage ||
      '';

    if (image) {
      // Make the meta-tag image absolute; if it isn't reachable, fall back to
      // CSS backgrounds, the first <img>, then any image URL in the raw HTML.
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
      // No meta-tag image — try CSS backgrounds, the first <img>, then raw HTML.
      const styleImage = extractImageFromStyles();
      if (styleImage) {
        image = makeAbsoluteUrl(styleImage, url);
      } else {
        const firstImg = $('img').first().attr('src') || '';
        image = firstImg ? makeAbsoluteUrl(firstImg, url) : findImageUrlInHtml();
      }
    }

    return NextResponse.json({
      url,
      title: title.trim(),
      image: image || null,
    });
  } catch (error) {
    console.error(
      `[Metadata] Error fetching metadata for ${url}:`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
  }
}
