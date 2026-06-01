-- ---------------------------------------------------------------------------
-- Idempotent cutover: Link.actressId (1:N)  ->  Link.actresses[] (M:N)
--
-- Safe to run on EVERY deploy. A single guarded DO block that:
--   * does nothing if `Link.actressId` is absent (fresh DB or already migrated);
--   * otherwise creates the `_ActressToLink` join table (byte-identical to
--     Prisma's implicit-m2m DDL), copies every existing association in,
--     verifies the counts, and drops the old column.
--
-- It is ONE statement, so it runs unchanged via psql or Prisma
-- `$executeRawUnsafe` (see scripts/cutover-actresses.ts). The whole block is
-- atomic — any error aborts it and leaves the database untouched.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    backed_up integer;
    migrated  integer;
BEGIN
    -- Serialize concurrent runs (e.g. two replicas starting at once): the rest
    -- block here until the first transaction commits, then fall through the
    -- guard below as a clean no-op instead of racing the destructive DROP.
    PERFORM pg_advisory_xact_lock(4019283746501);

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Link'
          AND column_name = 'actressId'
    ) THEN
        RAISE NOTICE 'actresses cutover: Link.actressId absent — nothing to do.';
        RETURN;
    END IF;

    RAISE NOTICE 'actresses cutover: migrating Link.actressId -> _ActressToLink ...';

    -- Insurance copy of the associations (survives the column drop).
    EXECUTE 'CREATE TABLE IF NOT EXISTS "_actress_migration_backup" AS
             SELECT id AS link_id, "actressId" AS actress_id
             FROM "Link" WHERE "actressId" IS NOT NULL';

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

    -- Copy every association ("A" = actress, "B" = link).
    EXECUTE 'INSERT INTO "_ActressToLink" ("A", "B")
             SELECT "actressId", id FROM "Link" WHERE "actressId" IS NOT NULL
             ON CONFLICT DO NOTHING';

    -- Verify nothing was lost: every backed-up pair must be present in the
    -- join table. Counting matched pairs (rather than all join rows) keeps the
    -- check correct even if the join table already held unrelated rows.
    SELECT count(*) INTO backed_up FROM "_actress_migration_backup";
    SELECT count(*) INTO migrated
    FROM "_actress_migration_backup" b
    JOIN "_ActressToLink" j ON j."A" = b.actress_id AND j."B" = b.link_id;
    IF backed_up <> migrated THEN
        RAISE EXCEPTION 'actresses cutover aborted: % backed up but % present in join table',
            backed_up, migrated;
    END IF;

    EXECUTE 'ALTER TABLE "Link" DROP COLUMN "actressId"';

    RAISE NOTICE 'actresses cutover: migrated % associations.', migrated;
END $$;
