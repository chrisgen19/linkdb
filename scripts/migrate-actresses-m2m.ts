/**
 * Two-phase migration for moving `Link.actressId` (one-to-many) to the
 * many-to-many `Link.actresses[]` relation.
 *
 * `prisma db push` drops the `actressId` column, so the existing tag
 * associations must be captured BEFORE the push and re-applied AFTER it.
 *
 * Usage:
 *   1. npx tsx scripts/migrate-actresses-m2m.ts export   # before db push
 *   2. npx prisma db push
 *   3. npx prisma generate
 *   4. npx tsx scripts/migrate-actresses-m2m.ts import    # after db push
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const PAIRS_FILE = join(__dirname, '.actress-pairs.json');

interface Pair {
  id: string;
  actressId: string;
}

async function exportPairs() {
  // Read the legacy column directly — at this point the schema still has it.
  const pairs = await prisma.$queryRaw<Pair[]>`
    SELECT id, "actressId" FROM "Link" WHERE "actressId" IS NOT NULL
  `;
  writeFileSync(PAIRS_FILE, JSON.stringify(pairs, null, 2));
  console.log(`Exported ${pairs.length} link→actress pairs to ${PAIRS_FILE}`);
}

async function importPairs() {
  if (!existsSync(PAIRS_FILE)) {
    throw new Error(`No pairs file at ${PAIRS_FILE} — run the export step first.`);
  }
  const pairs: Pair[] = JSON.parse(readFileSync(PAIRS_FILE, 'utf-8'));
  let applied = 0;
  let failed = 0;
  for (const { id, actressId } of pairs) {
    // A link/actress could have been deleted between export and import. Skip
    // and report those rather than aborting the whole run mid-migration.
    try {
      await prisma.link.update({
        where: { id },
        data: { actresses: { connect: { id: actressId } } },
      });
      applied++;
    } catch (e) {
      failed++;
      console.warn(`Skipped pair link=${id} actress=${actressId}:`, e);
    }
  }
  console.log(
    `Reconnected ${applied} of ${pairs.length} pairs into the join table (${failed} skipped)`
  );
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'export') {
    await exportPairs();
  } else if (mode === 'import') {
    await importPairs();
  } else {
    throw new Error('Pass "export" (before db push) or "import" (after db push)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
