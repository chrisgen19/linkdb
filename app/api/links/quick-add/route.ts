import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tokenFromRequest, userIdFromApiToken } from '@/lib/api-token';
import { assertHttpUrl, extractMetadata, MetadataError } from '@/lib/metadata';

// Scraping may use the headless-browser fallback, so allow the Node runtime
// and a generous timeout.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Token-authenticated link save for the iOS share Shortcut. Accepts the URL in
 * a JSON body ({ "url": "…" }), a form field, or a ?url= query param.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdFromApiToken(tokenFromRequest(request));
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Pull the URL from JSON, form-encoded body, or the query string.
  let url = request.nextUrl.searchParams.get('url') || '';
  if (!url) {
    const contentType = request.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        url = (await request.json())?.url || '';
      } else {
        const form = await request.formData();
        url = String(form.get('url') || '');
      }
    } catch {
      // Body was empty or unparseable — handled by the validation below.
    }
  }

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    assertHttpUrl(url);
  } catch (error) {
    const status = error instanceof MetadataError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid URL';
    return NextResponse.json({ error: message }, { status });
  }

  // Don't create duplicates for the same user.
  const existing = await prisma.link.findFirst({ where: { url, userId } });
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
    data: { url, title, image, userId },
    include: { actress: true },
  });

  return NextResponse.json({ ok: true, link }, { status: 201 });
}
