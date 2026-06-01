import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET all links for the authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const links = await prisma.link.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        actresses: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(links);
  } catch (error) {
    console.error('Error fetching links:', error);
    return NextResponse.json(
      { error: 'Failed to fetch links' },
      { status: 500 }
    );
  }
}

// POST a new link
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, title, image, favorite, actressIds, actressId } =
      await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Accept `actressIds: string[]`; tolerate a legacy single `actressId`.
    const ids: string[] = Array.isArray(actressIds)
      ? actressIds
      : actressId
        ? [actressId]
        : [];

    // Check if link already exists for this user
    const existingLink = await prisma.link.findFirst({
      where: {
        url,
        userId: session.user.id,
      },
    });

    if (existingLink) {
      return NextResponse.json(
        { error: 'Link already exists' },
        { status: 409 }
      );
    }

    // Create new link
    const link = await prisma.link.create({
      data: {
        url,
        title: title || null,
        image: image || null,
        favorite: favorite || false,
        actresses: { connect: ids.map((id) => ({ id })) },
        userId: session.user.id,
      },
      include: {
        actresses: true,
      },
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error('Error creating link:', error);
    return NextResponse.json(
      { error: 'Failed to create link' },
      { status: 500 }
    );
  }
}

// PATCH a link (update link details)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, favorite, actressIds, title, image } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

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

    // Build update data object with only provided fields
    const updateData: Prisma.LinkUpdateInput = {};
    if (favorite !== undefined) updateData.favorite = favorite;
    // Replace the whole tag set when actressIds is provided.
    if (Array.isArray(actressIds)) {
      updateData.actresses = { set: actressIds.map((aid: string) => ({ id: aid })) };
    }
    if (title !== undefined) updateData.title = title;
    if (image !== undefined) updateData.image = image;

    const link = await prisma.link.update({
      where: { id },
      data: updateData,
      include: {
        actresses: true,
      },
    });

    return NextResponse.json(link);
  } catch (error) {
    console.error('Error updating link:', error);
    return NextResponse.json(
      { error: 'Failed to update link' },
      { status: 500 }
    );
  }
}

// DELETE a link
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

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

    await prisma.link.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting link:', error);
    return NextResponse.json(
      { error: 'Failed to delete link' },
      { status: 500 }
    );
  }
}
