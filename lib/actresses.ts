import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Actress } from '@/lib/types';

// Each name costs sequential queries in resolveActresses, so callers cap the input.
export const MAX_ACTRESS_NAMES = 50;
export const MAX_ACTRESS_NAME_LENGTH = 100;

/** Returns a 400-style message when `names` exceeds the limits, otherwise null. */
export function actressNamesError(names: string[]): string | null {
  if (names.length > MAX_ACTRESS_NAMES) {
    return `At most ${MAX_ACTRESS_NAMES} actress tags per request`;
  }
  if (names.some((name) => name.trim().length > MAX_ACTRESS_NAME_LENGTH)) {
    return `Actress names must be ${MAX_ACTRESS_NAME_LENGTH} characters or fewer`;
  }
  return null;
}

/**
 * Find-or-create actresses by name. Trims each name, drops blanks, and dedupes
 * the input case-insensitively. Matching against existing rows is also
 * case-insensitive so "Anna" and "anna" resolve to the same actress.
 *
 * Returns the resolved actresses in the de-duplicated input order.
 */
export async function resolveActresses(names: string[]): Promise<Actress[]> {
  // Trim, drop blanks, and dedupe case-insensitively (first casing wins).
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  const resolved: Actress[] = [];
  for (const name of unique) {
    const existing = await prisma.actress.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      resolved.push(existing);
      continue;
    }
    try {
      resolved.push(await prisma.actress.create({ data: { name } }));
    } catch (error) {
      // Lost a create race on the unique name — fetch the winner instead.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await prisma.actress.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        // Don't silently drop the name — if the conflicting row can't be
        // found (e.g. it was deleted between create and re-find), rethrow so
        // callers fail loudly rather than saving with missing tags.
        if (!winner) throw error;
        resolved.push(winner);
      } else {
        throw error;
      }
    }
  }

  return resolved;
}
