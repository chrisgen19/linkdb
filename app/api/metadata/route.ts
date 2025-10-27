import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(request: NextRequest) {
  let url = '';
  try {
    const body = await request.json();
    url = body.url;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    console.log(`[Metadata] Fetching metadata for: ${url}`);

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkDB/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`[Metadata] Failed to fetch URL: ${url} - Status: ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch URL' },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    console.log(`[Metadata] Successfully loaded HTML for: ${url}`);

    // Extract metadata
    let title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    // Helper function to make URLs absolute
    const makeAbsoluteUrl = (imageUrl: string, baseUrl: string): string => {
      if (!imageUrl || imageUrl.startsWith('http')) {
        return imageUrl;
      }
      const urlObj = new URL(baseUrl);
      if (imageUrl.startsWith('//')) {
        return urlObj.protocol + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        return urlObj.origin + imageUrl;
      } else {
        return urlObj.origin + '/' + imageUrl;
      }
    };

    // Helper function to check if image URL is accessible
    const isImageAccessible = async (imageUrl: string): Promise<boolean> => {
      try {
        const imgResponse = await fetch(imageUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LinkDB/1.0)',
          },
        });
        return imgResponse.ok;
      } catch {
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

    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const twitterImage = $('meta[name="twitter:image"]').attr('content') || '';
    const linkImage = $('link[rel="image_src"]').attr('href') || '';

    console.log(`[Metadata] Image extraction for ${url}:`, {
      ogImage,
      twitterImage,
      linkImage,
    });

    let image = ogImage || twitterImage || linkImage || '';

    // Make image URL absolute if found
    if (image) {
      const originalImage = image;
      image = makeAbsoluteUrl(image, url);
      console.log(`[Metadata] Found meta image: ${originalImage} → ${image}`);

      // Check if the image is accessible, if not try alternatives
      const isAccessible = await isImageAccessible(image);
      if (!isAccessible) {
        console.warn(`[Metadata] Image not accessible (404): ${image}, trying alternatives...`);

        // Try to find image in inline styles
        const styleImage = extractImageFromStyles();
        if (styleImage) {
          image = makeAbsoluteUrl(styleImage, url);
          console.log(`[Metadata] Found image in CSS styles: ${image}`);
        } else {
          // Fall back to first img tag
          const firstImg = $('img').first().attr('src') || '';
          if (firstImg) {
            image = makeAbsoluteUrl(firstImg, url);
            console.log(`[Metadata] Fallback to first <img> tag: ${image}`);
          } else {
            image = '';
            console.warn(`[Metadata] No fallback images found for: ${url}`);
          }
        }
      } else {
        console.log(`[Metadata] Image is accessible: ${image}`);
      }
    } else {
      console.log(`[Metadata] No meta tag images found, trying alternatives...`);

      // No meta tag image found, try inline styles
      const styleImage = extractImageFromStyles();
      if (styleImage) {
        image = makeAbsoluteUrl(styleImage, url);
        console.log(`[Metadata] Found image in CSS styles: ${image}`);
      } else {
        // Fall back to first img tag
        const firstImg = $('img').first().attr('src') || '';
        if (firstImg) {
          image = makeAbsoluteUrl(firstImg, url);
          console.log(`[Metadata] Found first <img> tag: ${image}`);
        } else {
          console.warn(`[Metadata] No images found at all for: ${url}`);
        }
      }
    }

    const result = {
      url,
      title: title.trim(),
      image: image || null,
    };

    console.log(`[Metadata] Final result for ${url}:`, {
      title: result.title,
      hasImage: !!result.image,
      imageUrl: result.image,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[Metadata] Error fetching metadata for ${url}:`, error);
    console.error('[Metadata] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to extract metadata' },
      { status: 500 }
    );
  }
}
