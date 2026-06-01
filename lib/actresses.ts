import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Actress } from '@/lib/types';

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
        if (winner) resolved.push(winner);
      } else {
        throw error;
      }
    }
  }

  return resolved;
}
