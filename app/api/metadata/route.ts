import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { assertHttpUrl, extractMetadata, MetadataError } from '@/lib/metadata';

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

    assertHttpUrl(url);
    const metadata = await extractMetadata(url);
    return NextResponse.json(metadata);
  } catch (error) {
    if (error instanceof MetadataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      `[Metadata] Error fetching metadata for ${url}:`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
  }
}
