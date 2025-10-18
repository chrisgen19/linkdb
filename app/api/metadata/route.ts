import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkDB/1.0)',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch URL' },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

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

    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      '';

    // Make image URL absolute if found
    if (image) {
      image = makeAbsoluteUrl(image, url);

      // Check if the image is accessible, if not try alternatives
      const isAccessible = await isImageAccessible(image);
      if (!isAccessible) {
        console.log(`og:image returned 404: ${image}, trying alternative sources...`);

        // Try to find image in inline styles
        const styleImage = extractImageFromStyles();
        if (styleImage) {
          image = makeAbsoluteUrl(styleImage, url);
        } else {
          // Fall back to first img tag
          const firstImg = $('img').first().attr('src') || '';
          image = firstImg ? makeAbsoluteUrl(firstImg, url) : '';
        }
      }
    } else {
      // No meta tag image found, try inline styles
      const styleImage = extractImageFromStyles();
      if (styleImage) {
        image = makeAbsoluteUrl(styleImage, url);
      } else {
        // Fall back to first img tag
        const firstImg = $('img').first().attr('src') || '';
        image = firstImg ? makeAbsoluteUrl(firstImg, url) : '';
      }
    }

    return NextResponse.json({
      url,
      title: title.trim(),
      image: image || null,
    });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return NextResponse.json(
      { error: 'Failed to extract metadata' },
      { status: 500 }
    );
  }
}
