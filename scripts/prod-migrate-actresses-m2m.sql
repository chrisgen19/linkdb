-- ---------------------------------------------------------------------------
-- Production migration: Link.actressId (1:N)  ->  Link.actresses[] (M:N)
--
-- Moves every existing link->actress association into the implicit Prisma
-- join table `_ActressToLink`, then drops the old `actressId` column. The
-- whole thing runs in ONE transaction: if any step fails, nothing changes.
--
-- The join table is created byte-identical to what `prisma db push` would
-- generate, so deploying the new code afterwards is a clean no-op push.
--
-- Run this INSIDE the Postgres container, BEFORE deploying the new code:
--   docker exec -i <pg-container> psql -U postgres -d postgres < this-file.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Insurance: keep a plain copy of the associations (survives the column drop).
CREATE TABLE IF NOT EXISTS "_actress_migration_backup" AS
SELECT id AS link_id, "actressId" AS actress_id
FROM "Link"
WHERE "actressId" IS NOT NULL;

-- 2. Create the join table exactly as Prisma's implicit M:N relation expects.
CREATE TABLE "_ActressToLink" (
    "A" text NOT NULL,
    "B" text NOT NULL
);
CREATE UNIQUE INDEX "_ActressToLink_AB_unique" ON "_ActressToLink" ("A", "B");
CREATE INDEX "_ActressToLink_B_index" ON "_ActressToLink" ("B");
ALTER TABLE "_ActressToLink"
    ADD CONSTRAINT "_ActressToLink_A_fkey" FOREIGN KEY ("A")
    REFERENCES "Actress"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "_ActressToLink"
    ADD CONSTRAINT "_ActressToLink_B_fkey" FOREIGN KEY ("B")
    REFERENCES "Link"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- 3. Migrate every existing association ("A" = actress, "B" = link).
INSERT INTO "_ActressToLink" ("A", "B")
SELECT "actressId", id
FROM "Link"
WHERE "actressId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Drop the now-migrated column.
ALTER TABLE "Link" DROP COLUMN "actressId";

-- 5. Sanity check — these two counts must match (raises an error and rolls back
--    the whole transaction if they don't).
DO $$
DECLARE
    backed_up integer;
    migrated  integer;
BEGIN
    SELECT count(*) INTO backed_up FROM "_actress_migration_backup";
    SELECT count(*) INTO migrated  FROM "_ActressToLink";
    IF backed_up <> migrated THEN
        RAISE EXCEPTION 'Mismatch: % backed up but % migrated', backed_up, migrated;
    END IF;
    RAISE NOTICE 'Migrated % associations into _ActressToLink', migrated;
END $$;

COMMIT;
