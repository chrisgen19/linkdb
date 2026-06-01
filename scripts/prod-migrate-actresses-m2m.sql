-- ---------------------------------------------------------------------------
-- Idempotent cutover: Link.actressId (1:N)  ->  Link.actresses[] (M:N)
--
-- Safe to run on EVERY deploy. A single guarded DO block that:
--   * migrates Link.actressId into the `_ActressToLink` join table (byte-identical
--     to Prisma's implicit-m2m DDL) when the column still exists, verifying every
--     source pair landed before dropping the column;
--   * cleans up the legacy `_actress_migration_backup` table that earlier versions
--     of this script created. That table is NOT in the Prisma schema, so leaving
--     it makes `prisma db push` fail ("would drop a non-empty table"). It is only
--     dropped after confirming all of its rows are present in the join table, so
--     no association can ever be lost.
--
-- It is ONE statement, so it runs unchanged via psql or Prisma
-- `$executeRawUnsafe` (see scripts/cutover-actresses.mjs). The whole block is
-- atomic — any error aborts it and leaves the database untouched.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    src_pairs    integer;
    join_pairs   integer;
    missing_live integer;
BEGIN
    -- Serialize concurrent runs (e.g. two replicas starting at once): the rest
    -- block here until the first transaction commits, then fall through as a
    -- clean no-op instead of racing the destructive changes.
    PERFORM pg_advisory_xact_lock(4019283746501);

    -- PHASE 1 — migrate the column into the join table, if it still exists.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Link'
          AND column_name = 'actressId'
    ) THEN
        RAISE NOTICE 'actresses cutover: migrating Link.actressId -> _ActressToLink ...';

        -- Join table, exactly as `prisma db push` would generate it.
        EXECUTE 'CREATE TABLE IF NOT EXISTS "_ActressToLink"
                 ("A" text NOT NULL, "B" text NOT NULL)';
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "_ActressToLink_AB_unique"
                 ON "_ActressToLink" ("A", "B")';
        EXECUTE 'CREATE INDEX IF NOT EXISTS "_ActressToLink_B_index"
                 ON "_ActressToLink" ("B")';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ActressToLink_A_fkey') THEN
            EXECUTE 'ALTER TABLE "_ActressToLink" ADD CONSTRAINT "_ActressToLink_A_fkey"
                     FOREIGN KEY ("A") REFERENCES "Actress"(id) ON UPDATE CASCADE ON DELETE CASCADE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ActressToLink_B_fkey') THEN
            EXECUTE 'ALTER TABLE "_ActressToLink" ADD CONSTRAINT "_ActressToLink_B_fkey"
                     FOREIGN KEY ("B") REFERENCES "Link"(id) ON UPDATE CASCADE ON DELETE CASCADE';
        END IF;

        SELECT count(*) INTO src_pairs FROM "Link" WHERE "actressId" IS NOT NULL;

        EXECUTE 'INSERT INTO "_ActressToLink" ("A", "B")
                 SELECT "actressId", id FROM "Link" WHERE "actressId" IS NOT NULL
                 ON CONFLICT DO NOTHING';

        -- Verify every source pair is present before dropping the column.
        SELECT count(*) INTO join_pairs
        FROM "Link" l
        JOIN "_ActressToLink" j ON j."A" = l."actressId" AND j."B" = l.id
        WHERE l."actressId" IS NOT NULL;

        IF src_pairs <> join_pairs THEN
            RAISE EXCEPTION 'actresses cutover aborted: % source pairs but % in join table',
                src_pairs, join_pairs;
        END IF;

        EXECUTE 'ALTER TABLE "Link" DROP COLUMN "actressId"';
        RAISE NOTICE 'actresses cutover: migrated % associations.', src_pairs;
    ELSE
        RAISE NOTICE 'actresses cutover: Link.actressId absent — already migrated or fresh DB.';
    END IF;

    -- PHASE 2 — drop the legacy insurance table (it blocks `prisma db push`).
    -- Only after confirming every one of its rows lives in the join table.
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = '_actress_migration_backup'
    ) THEN
        -- Only block on backup rows whose link AND actress STILL EXIST but are
        -- missing from the join table — that would be a genuine migration gap.
        -- Rows whose source link/actress were since deleted are stale snapshots
        -- (their join row was removed by ON DELETE CASCADE) and safe to discard.
        SELECT count(*) INTO missing_live
        FROM "_actress_migration_backup" b
        JOIN "Link" l    ON l.id = b.link_id
        JOIN "Actress" a ON a.id = b.actress_id
        LEFT JOIN "_ActressToLink" j ON j."A" = b.actress_id AND j."B" = b.link_id
        WHERE j."A" IS NULL;

        IF missing_live > 0 THEN
            RAISE EXCEPTION 'refusing to drop _actress_migration_backup: % live association(s) missing from join table',
                missing_live;
        END IF;

        EXECUTE 'DROP TABLE "_actress_migration_backup"';
        RAISE NOTICE 'actresses cutover: removed legacy _actress_migration_backup.';
    END IF;
END $$;
