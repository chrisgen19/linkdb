import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveActresses } from '@/lib/actresses';

// GET all actresses
export async function GET() {
  try {
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
    const { name, names } = await request.json();

    // Bulk find-or-create: returns the resolved actresses as an array.
    if (Array.isArray(names)) {
      return NextResponse.json(await resolveActresses(names));
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
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
