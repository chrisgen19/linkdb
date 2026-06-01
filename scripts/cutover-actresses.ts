/**
 * Runtime cutover hook — runs at container start, before `prisma db push`.
 *
 * Executes the idempotent, self-guarding migration in
 * `scripts/prod-migrate-actresses-m2m.sql` (Link.actressId -> _ActressToLink).
 * It is a no-op once the column is gone, so it's safe on every deploy and on
 * fresh databases. The migration is a single DO block, so it runs cleanly via
 * Prisma's `$executeRawUnsafe`.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(
    join(__dirname, 'prod-migrate-actresses-m2m.sql'),
    'utf-8'
  );
  await prisma.$executeRawUnsafe(sql);
  console.log('actresses cutover: done (migrated or already up to date).');
}

main()
  .catch((e) => {
    console.error('actresses cutover failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
