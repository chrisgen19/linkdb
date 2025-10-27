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
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkDB/1.0)',
        },
        redirect: 'follow',
      });
    } catch (fetchError) {
      console.error(`[Metadata] ❌ FETCH FAILED for: ${url}`, {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        possibleCauses: [
          'Network error / Timeout',
          'DNS resolution failed',
          'SSL/TLS certificate error',
          'CORS blocking request',
          'Invalid URL format',
        ],
      });
      return NextResponse.json(
        { error: `Cannot fetch URL: ${fetchError instanceof Error ? fetchError.message : 'Network error'}` },
        { status: 500 }
      );
    }

    console.log(`[Metadata] Response received:`, {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      redirected: response.redirected,
      finalUrl: response.url,
    });

    if (!response.ok) {
      const errorDetails = {
        url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      };

      console.error(`[Metadata] ❌ HTTP ERROR: ${response.status} ${response.statusText}`, errorDetails);

      // Provide specific error messages based on status code
      if (response.status === 403) {
        console.error(`[Metadata] 403 Forbidden - Server blocked the request. Possible causes: Bot detection, IP blocking, or authentication required`);
      } else if (response.status === 404) {
        console.error(`[Metadata] 404 Not Found - URL does not exist`);
      } else if (response.status === 429) {
        console.error(`[Metadata] 429 Too Many Requests - Rate limited by server`);
      } else if (response.status >= 500) {
        console.error(`[Metadata] ${response.status} Server Error - The website's server is having issues`);
      }

      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      console.warn(`[Metadata] ⚠️ WARNING: Content-Type is not HTML: ${contentType}. May not extract metadata properly.`);
    }

    let html;
    try {
      html = await response.text();
      console.log(`[Metadata] ✅ Successfully fetched HTML (${html.length} characters)`);
    } catch (parseError) {
      console.error(`[Metadata] ❌ Failed to parse response body:`, {
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
      });
      return NextResponse.json(
        { error: 'Failed to read response body' },
        { status: 500 }
      );
    }

    let $;
    try {
      $ = cheerio.load(html);
      console.log(`[Metadata] ✅ Successfully parsed HTML with Cheerio`);
    } catch (cheerioError) {
      console.error(`[Metadata] ❌ Failed to parse HTML with Cheerio:`, {
        error: cheerioError instanceof Error ? cheerioError.message : 'Unknown error',
        htmlPreview: html.substring(0, 200) + '...',
      });
      return NextResponse.json(
        { error: 'Failed to parse HTML' },
        { status: 500 }
      );
    }

    // Extract title from multiple sources
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';
    const schemaName = $('meta[itemprop="name"]').attr('content') || '';
    const metaTitle = $('meta[name="title"]').attr('content') || '';
    const dcTitle = $('meta[name="DC.title"]').attr('content') || '';
    const h1Title = $('h1').first().text().trim() || '';
    const htmlTitle = $('title').text().trim() || '';

    console.log(`[Metadata] Title extraction for ${url}:`, {
      ogTitle,
      twitterTitle,
      schemaName,
      metaTitle,
      dcTitle,
      h1Title: h1Title.substring(0, 50) + (h1Title.length > 50 ? '...' : ''),
      htmlTitle,
    });

    let title = ogTitle || twitterTitle || schemaName || metaTitle || dcTitle || htmlTitle || h1Title || '';

    // Helper function to make URLs absolute
    const makeAbsoluteUrl = (imageUrl: string, baseUrl: string): string => {
      if (!imageUrl) {
        console.warn(`[Metadata] makeAbsoluteUrl: Empty image URL provided`);
        return imageUrl;
      }

      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }

      try {
        const urlObj = new URL(baseUrl);
        let absoluteUrl = '';

        if (imageUrl.startsWith('//')) {
          absoluteUrl = urlObj.protocol + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          absoluteUrl = urlObj.origin + imageUrl;
        } else {
          absoluteUrl = urlObj.origin + '/' + imageUrl;
        }

        console.log(`[Metadata] Converted relative URL: ${imageUrl} → ${absoluteUrl}`);
        return absoluteUrl;
      } catch (error) {
        console.error(`[Metadata] Error converting URL to absolute:`, {
          imageUrl,
          baseUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return imageUrl;
      }
    };

    // Helper function to check if image URL is accessible
    const isImageAccessible = async (imageUrl: string): Promise<boolean> => {
      try {
        console.log(`[Metadata] Checking image accessibility: ${imageUrl}`);
        const imgResponse = await fetch(imageUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LinkDB/1.0)',
          },
        });

        console.log(`[Metadata] Image check response:`, {
          url: imageUrl,
          status: imgResponse.status,
          statusText: imgResponse.statusText,
          contentType: imgResponse.headers.get('content-type'),
          ok: imgResponse.ok,
        });

        if (!imgResponse.ok) {
          console.warn(`[Metadata] Image not accessible - Status ${imgResponse.status}: ${imageUrl}`);
        }

        return imgResponse.ok;
      } catch (error) {
        console.error(`[Metadata] Error checking image accessibility: ${imageUrl}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          type: error instanceof Error ? error.constructor.name : typeof error,
        });
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

    // Extract all possible image sources
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogImageSecure = $('meta[property="og:image:secure_url"]').attr('content') || '';
    const twitterImage = $('meta[name="twitter:image"]').attr('content') || '';
    const twitterImageSrc = $('meta[name="twitter:image:src"]').attr('content') || '';
    const linkImage = $('link[rel="image_src"]').attr('href') || '';
    const thumbnailUrl = $('meta[property="thumbnailUrl"]').attr('content') ||
                         $('meta[name="thumbnailUrl"]').attr('content') ||
                         $('meta[itemprop="thumbnailUrl"]').attr('content') || '';
    const schemaImage = $('meta[itemprop="image"]').attr('content') || '';
    const msImage = $('meta[name="msapplication-TileImage"]').attr('content') || '';

    console.log(`[Metadata] Image extraction for ${url}:`, {
      ogImage,
      ogImageSecure,
      twitterImage,
      twitterImageSrc,
      linkImage,
      thumbnailUrl,
      schemaImage,
      msImage,
    });

    let image = ogImage || ogImageSecure || twitterImage || twitterImageSrc || linkImage || thumbnailUrl || schemaImage || msImage || '';

    if (!image) {
      console.warn(`[Metadata] No meta tag images found for ${url}. Will try CSS and <img> fallbacks.`);
    }

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
      console.log(`[Metadata] Attempting CSS background-image extraction...`);
      const styleImage = extractImageFromStyles();
      if (styleImage) {
        image = makeAbsoluteUrl(styleImage, url);
        console.log(`[Metadata] Found image in CSS styles: ${image}`);
      } else {
        console.log(`[Metadata] No CSS background images found`);

        // Fall back to first img tag
        console.log(`[Metadata] Attempting to find first <img> tag...`);
        const firstImg = $('img').first().attr('src') || '';
        const imgCount = $('img').length;
        console.log(`[Metadata] Found ${imgCount} <img> tags on page`);

        if (firstImg) {
          image = makeAbsoluteUrl(firstImg, url);
          console.log(`[Metadata] Found first <img> tag: ${image}`);
        } else {
          console.warn(`[Metadata] ⚠️ NO IMAGES FOUND AT ALL for: ${url}`);
          console.warn(`[Metadata] Summary - No images in: meta tags, CSS, or <img> elements`);
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
