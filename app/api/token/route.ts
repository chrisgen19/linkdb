import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateApiToken, regenerateApiToken } from '@/lib/api-token';

export const runtime = 'nodejs';

// Return the current token (creating one on first access).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = await getOrCreateApiToken(session.user.id);
  return NextResponse.json({ token });
}

// Rotate the token.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = await regenerateApiToken(session.user.id);
  return NextResponse.json({ token });
}
