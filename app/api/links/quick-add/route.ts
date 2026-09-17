import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { actressNamesError, resolveActresses } from '@/lib/actresses';
import { findDuplicateLink } from '@/lib/links';
import { tokenFromRequest, userIdFromApiToken } from '@/lib/api-token';
import { assertHttpUrl, extractMetadata, MetadataError } from '@/lib/metadata';

// Scraping may use the headless-browser fallback, so allow the Node runtime
// and a generous timeout.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Token-authenticated link save for the iOS share Shortcut.
 *
 * Works over GET or POST so the Shortcut can be configured the simplest,
 * least error-prone way (GET avoids the "Get Contents of URL" method/body
 * pitfalls). The token comes from `Authorization: Bearer …`, `x-api-token`,
 * or a `?token=` query param; the URL from `?url=` or a JSON/form body.
 */
async function handleQuickAdd(request: NextRequest): Promise<NextResponse> {
  const queryToken = request.nextUrl.searchParams.get('token') || '';
  const userId = await userIdFromApiToken(tokenFromRequest(request) || queryToken);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // URL (and optional comma-separated actresses) from the query string, or
  // (for POST) a JSON / form body.
  let url = request.nextUrl.searchParams.get('url') || '';
  let actressParam = request.nextUrl.searchParams.get('actress') || '';
  if ((!url || !actressParam) && request.method !== 'GET') {
    const contentType = request.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        const body = await request.json();
        url = url || (typeof body?.url === 'string' ? body.url : '');
        actressParam =
          actressParam || (typeof body?.actress === 'string' ? body.actress : '');
      } else {
        const form = await request.formData();
        url = url || String(form.get('url') || '');
        actressParam = actressParam || String(form.get('actress') || '');
      }
    } catch {
      // Body empty/unparseable — handled by the validation below.
    }
  }

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let href: string;
  try {
    href = assertHttpUrl(url).href;
  } catch (error) {
    const status = error instanceof MetadataError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid URL';
    return NextResponse.json({ error: message }, { status });
  }

  const actressNames = actressParam ? actressParam.split(',') : [];
  const invalidNames = actressNamesError(actressNames);
  if (invalidNames) {
    return NextResponse.json({ error: invalidNames }, { status: 400 });
  }

  // Don't create duplicates for the same user (any equivalent spelling).
  const existing = await findDuplicateLink(userId, url, href);
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, link: existing });
  }

  // Comma-separated actresses: find-or-create only once the link will be saved.
  const actresses = actressNames.length ? await resolveActresses(actressNames) : [];

  // Best-effort metadata; if scraping fails the link still saves URL-only.
  let title: string | null = null;
  let image: string | null = null;
  try {
    const meta = await extractMetadata(href);
    title = meta.title || null;
    image = meta.image;
  } catch (error) {
    console.error(
      `[QuickAdd] Metadata failed for ${url}, saving URL only:`,
      error instanceof Error ? error.message : error
    );
  }

  const link = await prisma.link.create({
    data: {
      url: href,
      title,
      image,
      userId,
      actresses: { connect: actresses.map((a) => ({ id: a.id })) },
    },
    include: { actresses: true },
  });

  return NextResponse.json({ ok: true, link }, { status: 201 });
}

export async function GET(request: NextRequest) {
  return handleQuickAdd(request);
}

export async function POST(request: NextRequest) {
  return handleQuickAdd(request);
}
