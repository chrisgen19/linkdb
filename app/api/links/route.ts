import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  MAX_ACTRESS_NAMES,
  parseActressNames,
  resolveActresses,
} from '@/lib/actresses';
import { findDuplicateLink } from '@/lib/links';
import { normalizeHttpUrl } from '@/lib/url';

const TOO_MANY_TAGS = `At most ${MAX_ACTRESS_NAMES} actress tags per request`;

const uniqueIds = (ids: string[]) => Array.from(new Set(ids));

/** String entries of a request array field; anything else is ignored. */
const stringIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? uniqueIds(value.filter((id): id is string => typeof id === 'string'))
    : [];

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

    const {
      url: rawUrl,
      title,
      image,
      favorite,
      actressIds,
      actressId,
      actressNames,
    } = await request.json();

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Only store http(s) links, in normalized form.
    const url = typeof rawUrl === 'string' ? normalizeHttpUrl(rawUrl) : null;
    if (!url) {
      return NextResponse.json(
        { error: 'Only http(s) URLs are supported' },
        { status: 400 }
      );
    }

    // Accept `actressIds: string[]`; tolerate a legacy single `actressId`.
    const ids = stringIds(Array.isArray(actressIds) ? actressIds : [actressId]);

    const parsedNames = parseActressNames(actressNames);
    if (parsedNames.error !== undefined) {
      return NextResponse.json({ error: parsedNames.error }, { status: 400 });
    }
    if (ids.length + parsedNames.names.length > MAX_ACTRESS_NAMES) {
      return NextResponse.json({ error: TOO_MANY_TAGS }, { status: 400 });
    }

    // Check if the link (or an equivalent spelling of it) already exists
    const existingLink = await findDuplicateLink(session.user.id, rawUrl, url);

    if (existingLink) {
      return NextResponse.json(
        { error: 'Link already exists' },
        { status: 409 }
      );
    }

    // Tag names are resolved here, with the link write, so the client's single
    // save request is the point after which nothing can be cancelled. One
    // transaction: if the link write fails, newly created tags roll back too.
    const link = await prisma.$transaction(async (tx) => {
      const resolved = await resolveActresses(parsedNames.names, tx);
      const tagIds = uniqueIds([...ids, ...resolved.map((a) => a.id)]);

      return tx.link.create({
        data: {
          url,
          title: title || null,
          image: image || null,
          favorite: favorite || false,
          actresses: { connect: tagIds.map((id) => ({ id })) },
          userId: session.user.id,
        },
        include: {
          actresses: true,
        },
      });
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

    const { id, favorite, actressIds, actressNames, title, image } =
      await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const parsedNames = parseActressNames(actressNames);
    if (parsedNames.error !== undefined) {
      return NextResponse.json({ error: parsedNames.error }, { status: 400 });
    }
    const ids = stringIds(actressIds);
    if (ids.length + parsedNames.names.length > MAX_ACTRESS_NAMES) {
      return NextResponse.json({ error: TOO_MANY_TAGS }, { status: 400 });
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

    // One transaction: if the update fails, newly created tags roll back too.
    const link = await prisma.$transaction(async (tx) => {
      // Build update data object with only provided fields
      const updateData: Prisma.LinkUpdateInput = {};
      if (favorite !== undefined) updateData.favorite = favorite;
      // Replace the whole tag set when actressIds and/or actressNames is provided.
      if (Array.isArray(actressIds) || actressNames !== undefined) {
        const resolved = await resolveActresses(parsedNames.names, tx);
        const tagIds = uniqueIds([...ids, ...resolved.map((a) => a.id)]);
        updateData.actresses = { set: tagIds.map((aid) => ({ id: aid })) };
      }
      if (title !== undefined) updateData.title = title;
      if (image !== undefined) updateData.image = image;

      return tx.link.update({
        where: { id },
        data: updateData,
        include: {
          actresses: true,
        },
      });
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
