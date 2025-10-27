import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    const { name } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check if actress already exists
    const existingActress = await prisma.actress.findUnique({
      where: { name: name.trim() },
    });

    if (existingActress) {
      return NextResponse.json(existingActress);
    }

    // Create new actress
    const actress = await prisma.actress.create({
      data: {
        name: name.trim(),
      },
    });

    return NextResponse.json(actress, { status: 201 });
  } catch (error) {
    console.error('Error creating actress:', error);
    return NextResponse.json(
      { error: 'Failed to create actress' },
      { status: 500 }
    );
  }
}
