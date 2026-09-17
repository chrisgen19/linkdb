import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { actressNamesError, resolveActresses } from '@/lib/actresses';

// GET all actresses
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actresses = await prisma.actress.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(actresses);
  } catch (error) {
    console.error('Error fetching actresses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch actresses' },
      { status: 500 }
    );
  }
}

// POST a new actress
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, names } = await request.json();

    // Bulk find-or-create: returns the resolved actresses as an array.
    if (Array.isArray(names)) {
      if (!names.every((n) => typeof n === 'string')) {
        return NextResponse.json(
          { error: 'Names must be strings' },
          { status: 400 }
        );
      }
      const invalid = actressNamesError(names);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      return NextResponse.json(await resolveActresses(names));
    }

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const invalid = actressNamesError([name]);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    // Route single-name through the same case-insensitive find-or-create as the
    // bulk path so `{ name: "anna" }` resolves to an existing "Anna" instead of
    // creating a duplicate.
    const [actress] = await resolveActresses([name]);
    return NextResponse.json(actress);
  } catch (error) {
    console.error('Error creating actress:', error);
    return NextResponse.json(
      { error: 'Failed to create actress' },
      { status: 500 }
    );
  }
}
