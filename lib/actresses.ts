import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Actress } from '@/lib/types';

// Bounds the size of a single find-or-create call; callers check before any DB work.
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
 * Validates an optional `actressNames` request field: absent, or an array of
 * strings within the limits. Returns the names (empty when absent) or an error.
 */
export function parseActressNames(
  value: unknown
): { names: string[]; error?: never } | { error: string } {
  if (value === undefined) return { names: [] };
  if (!Array.isArray(value) || !value.every((n) => typeof n === 'string')) {
    return { error: 'Actress names must be an array of strings' };
  }
  const error = actressNamesError(value);
  return error ? { error } : { names: value };
}

/**
 * Find-or-create actresses by name. Trims each name, drops blanks, and dedupes
 * the input case-insensitively. Matching against existing rows is also
 * case-insensitive so "Anna" and "anna" resolve to the same actress.
 *
 * Pass a transaction client to make the created rows part of a larger write.
 * Uses a fixed number of queries and never raises on a concurrent insert of
 * the same name, so it is safe inside a Postgres transaction.
 *
 * Returns the resolved actresses in the de-duplicated input order.
 */
export async function resolveActresses(
  names: string[],
  db: Prisma.TransactionClient = prisma
): Promise<Actress[]> {
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
  if (unique.length === 0) return [];

  const findExisting = async () => {
    const rows = await db.actress.findMany({
      where: { OR: unique.map((name) => ({ name: { equals: name, mode: 'insensitive' } })) },
      orderBy: { createdAt: 'asc' },
    });
    // Oldest row wins if the table already holds several casings of a name.
    const byKey = new Map<string, Actress>();
    for (const row of rows) {
      const key = row.name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, row);
    }
    return byKey;
  };

  let existing = await findExisting();
  const missing = unique.filter((name) => !existing.has(name.toLowerCase()));
  if (missing.length > 0) {
    // ON CONFLICT DO NOTHING: losing a create race to a concurrent request is
    // not an error, so an enclosing transaction is not aborted.
    await db.actress.createMany({
      data: missing.map((name) => ({ name })),
      skipDuplicates: true,
    });
    existing = await findExisting();
  }

  return unique.map((name) => {
    const actress = existing.get(name.toLowerCase());
    // Fail loudly rather than saving with a missing tag (e.g. a row deleted
    // between the insert and the re-read).
    if (!actress) throw new Error(`Could not resolve actress "${name}"`);
    return actress;
  });
}
