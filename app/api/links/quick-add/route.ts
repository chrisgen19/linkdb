import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveActresses } from '@/lib/actresses';
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
        url = url || body?.url || '';
        actressParam = actressParam || body?.actress || '';
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

  // Comma-separated actresses → find-or-create, then connect on save.
  const actresses = actressParam ? await resolveActresses(actressParam.split(',')) : [];

  try {
    assertHttpUrl(url);
  } catch (error) {
    const status = error instanceof MetadataError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid URL';
    return NextResponse.json({ error: message }, { status });
  }

  // Don't create duplicates for the same user.
  const existing = await prisma.link.findFirst({
    where: { url, userId },
    include: { actresses: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, link: existing });
  }

  // Best-effort metadata; if scraping fails the link still saves URL-only.
  let title: string | null = null;
  let image: string | null = null;
  try {
    const meta = await extractMetadata(url);
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
      url,
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
