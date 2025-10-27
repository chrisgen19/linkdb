import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST to increment click count
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the link belongs to the user
    const existingLink = await prisma.link.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Increment click count
    const updatedLink = await prisma.link.update({
      where: { id },
      data: {
        clickCount: {
          increment: 1,
        },
      },
      include: {
        actress: true,
      },
    });

    return NextResponse.json(updatedLink);
  } catch (error) {
    console.error('Error incrementing click count:', error);
    return NextResponse.json(
      { error: 'Failed to increment click count' },
      { status: 500 }
    );
  }
}
