import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { createDatabase, type AllSearchDatabase } from '@/libs/database/client';
import { migrateDatabase } from '@/libs/database/migrate';
import { collectionRunItems, collectionRuns, projects, settings } from '@/libs/database/schema';
import { cleanupTempDbPath, closeDatabase, createTempDbPath } from './testHelpers';

const EXPECTED_TABLE_NAMES = [
  'collection_run_items',
  'collection_runs',
  'competitors',
  'organizations',
  'projects',
  'prompt_articles',
  'prompt_responses',
  'prompts',
  'settings',
  'sources',
  'topics',
].sort();

function backupFilesNextTo(dbPath: string): string[] {
  return readdirSync(dirname(dbPath)).filter((name) => name.includes('.backup'));
}

describe('migrateDatabase', () => {
  let dbPath: string | undefined;
  let db: AllSearchDatabase | undefined;

  afterEach(() => {
    delete process.env.ALLSEARCH_DB_PATH;
    if (db) closeDatabase(db);
    if (dbPath) cleanupTempDbPath(dbPath);
    db = undefined;
    dbPath = undefined;
  });

  it('migrating a fresh path creates the file and all 11 tables', async () => {
    dbPath = createTempDbPath('migrate-fresh');
    db = await createDatabase(dbPath);
    await migrateDatabase(db, dbPath);

    expect(existsSync(dbPath)).toBe(true);

    const tables = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'`
    );
    expect(tables.map((t) => t.name).sort()).toEqual(EXPECTED_TABLE_NAMES);
    expect(backupFilesNextTo(dbPath)).toEqual([]);
  });

  it('running the migration twice is a no-op the second time and produces no backup', async () => {
    dbPath = createTempDbPath('migrate-noop');
    db = await createDatabase(dbPath);
    await migrateDatabase(db, dbPath);

    await migrateDatabase(db, dbPath);

    expect(backupFilesNextTo(dbPath)).toEqual([]);
  });

  it('backs up a pre-existing database before migrating, preserving the pre-migration data', async () => {
    dbPath = createTempDbPath('migrate-existing');

    // Simulate a database left behind by a previous app session, at an older journal state
    // (here, one that predates drizzle's own migration bookkeeping entirely).
    const seedDb = new Database(dbPath);
    seedDb.run('CREATE TABLE legacy_marker (id INTEGER PRIMARY KEY, note TEXT)');
    seedDb.run("INSERT INTO legacy_marker (note) VALUES ('pre-migration data')");
    seedDb.close();

    db = await createDatabase(dbPath);
    await migrateDatabase(db, dbPath);

    const backupFiles = backupFilesNextTo(dbPath);
    expect(backupFiles.length).toBe(1);

    const backupDb = new Database(join(dirname(dbPath), backupFiles[0]));
    const rows = backupDb.query('SELECT note FROM legacy_marker').all();
    backupDb.close();
    expect(rows).toEqual([{ note: 'pre-migration data' }]);
  });

  it('upgrades a database already at migration N to N+1, backing up the pre-migration state', async () => {
    dbPath = createTempDbPath('migrate-upgrade');

    // Fresh install against the app's real (single) migration, then insert a row that must
    // survive into the backup but not into the post-upgrade live database's new column.
    db = await createDatabase(dbPath);
    await migrateDatabase(db, dbPath);
    const [project] = await db
      .insert(projects)
      .values({ url: 'https://example.com', name: 'Example', aliases: [] })
      .returning();
    closeDatabase(db);

    // Build a migrations folder holding a copy of every real migration plus a second migration
    // this test invents, so the upgrade path can be exercised without touching the app's real
    // `drizzle/` folder. Sorted so this keeps working once there's more than one real migration —
    // directory order isn't guaranteed, and `[0]` alone would silently copy just one of them.
    const realMigrationsFolder = join(process.cwd(), 'drizzle');
    const realMigrationNames = readdirSync(realMigrationsFolder).sort();
    const upgradeMigrationsFolder = mkdtempSync(join(tmpdir(), 'allsearch-migrate-upgrade-'));
    for (const migrationName of realMigrationNames) {
      cpSync(
        join(realMigrationsFolder, migrationName),
        join(upgradeMigrationsFolder, migrationName),
        { recursive: true }
      );
    }
    const secondMigrationName = '20991231235959_add_test_col';
    mkdirSync(join(upgradeMigrationsFolder, secondMigrationName));
    writeFileSync(
      join(upgradeMigrationsFolder, secondMigrationName, 'migration.sql'),
      'ALTER TABLE `projects` ADD `test_col` text;'
    );

    try {
      db = await createDatabase(dbPath);
      await migrateDatabase(db, dbPath, upgradeMigrationsFolder);

      const backupFiles = backupFilesNextTo(dbPath);
      expect(backupFiles.length).toBe(1);

      const backupDb = new Database(join(dirname(dbPath), backupFiles[0]));
      const backupColumns = backupDb.query('PRAGMA table_info(projects)').all() as {
        name: string;
      }[];
      expect(backupColumns.some((column) => column.name === 'test_col')).toBe(false);
      const backupProject = backupDb
        .query('SELECT id, name FROM projects WHERE id = ?')
        .get(project.id) as { id: string; name: string };
      backupDb.close();
      expect(backupProject).toEqual({ id: project.id, name: 'Example' });

      const liveColumns = await db.all<{ name: string }>(sql`PRAGMA table_info(projects)`);
      expect(liveColumns.some((column) => column.name === 'test_col')).toBe(true);

      const appliedMigrations = await db.all<{ name: string }>(
        sql`SELECT name FROM __drizzle_migrations`
      );
      expect(appliedMigrations.map((migration) => migration.name).sort()).toEqual(
        [...realMigrationNames, secondMigrationName].sort()
      );
    } finally {
      rmSync(upgradeMigrationsFolder, { recursive: true, force: true });
    }
  });

  it('preserves settings data through the real migration sequence, including the table rebuild', async () => {
    dbPath = createTempDbPath('migrate-settings-data');

    // Migrate only as far as the app's real migration that *creates* `settings`
    // (20260729160709_dazzling_sue_storm, the second migration overall) — deliberately not as far
    // as the migration after it that rebuilds the table. This reproduces the exact gap that let
    // `enabled_chatbots = '[]'` survive that rebuild uncaught: the previous upgrade test only ever
    // exercises the rebuild against an empty `settings` table, because it applies every real
    // `settings` migration during its own "fresh" setup step before upgrading.
    const realMigrationsFolder = join(process.cwd(), 'drizzle');
    const realMigrationNames = readdirSync(realMigrationsFolder).sort();
    const migrationsBeforeRebuild = realMigrationNames.slice(0, 2);
    const beforeRebuildFolder = mkdtempSync(join(tmpdir(), 'allsearch-migrate-settings-'));
    for (const migrationName of migrationsBeforeRebuild) {
      cpSync(
        join(realMigrationsFolder, migrationName),
        join(beforeRebuildFolder, migrationName),
        { recursive: true }
      );
    }

    try {
      db = await createDatabase(dbPath);
      await migrateDatabase(db, dbPath, beforeRebuildFolder);

      // Seed a row via raw SQL, not the drizzle `settings` insert builder: the builder reflects
      // today's schema (nullable `enabled_chatbots`, no default) and would bind an explicit NULL,
      // which the table at this migration state rejects — it still has the first `settings`
      // migration's `NOT NULL DEFAULT '[]'`. Omitting the column, as a real install on this old
      // schema would, lets SQLite apply that default itself.
      await db.run(sql`
        INSERT INTO settings (id, created_at, updated_at, provider_keys)
        VALUES ('seed-id', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
                '{"google":{"key":"g-seed-key","status":"valid","validatedAt":"now"}}')
      `);
      const [seeded] = await db.select().from(settings);
      expect(seeded.enabled_chatbots).toEqual([]);
      closeDatabase(db);

      // Now apply the app's real, full migration sequence — the table rebuild and any migration
      // after it (currently, the backfill/consolidation migration).
      db = await createDatabase(dbPath);
      await migrateDatabase(db, dbPath);

      const rows = await db.select().from(settings);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('singleton');
      expect(rows[0].created_at).toBe(seeded.created_at);
      expect(rows[0].provider_keys).toEqual({
        google: { key: 'g-seed-key', status: 'valid', validatedAt: 'now' },
      });
      expect(rows[0].enabled_chatbots).toBeNull();
    } finally {
      rmSync(beforeRebuildFolder, { recursive: true, force: true });
    }
  });

  it('adds scope as a plain column ADD, preserving a pre-existing Run and its Run items (finding 1: no cascade-delete)', async () => {
    dbPath = createTempDbPath('migrate-collection-runs-scope');

    // Migrate using only the migrations before add_collection_runs_scope — an ALTER TABLE ADD is
    // what this guards; a table recreate (`CREATE __new_x` / `INSERT SELECT` / `DROP TABLE` /
    // `RENAME`) on `collection_runs` would cascade-delete these `collection_run_items` rows because
    // `PRAGMA foreign_keys` is ON for every connection and cannot be toggled off inside the
    // migration transaction.
    const realMigrationsFolder = join(process.cwd(), 'drizzle');
    const realMigrationNames = readdirSync(realMigrationsFolder).sort();
    // By name, not position: later migrations keep landing after this one.
    const scopeMigrationIndex = realMigrationNames.findIndex((name) =>
      name.endsWith('_add_collection_runs_scope')
    );
    const migrationsBeforeScope = realMigrationNames.slice(0, scopeMigrationIndex);
    const beforeScopeFolder = mkdtempSync(join(tmpdir(), 'allsearch-migrate-scope-'));
    for (const migrationName of migrationsBeforeScope) {
      cpSync(join(realMigrationsFolder, migrationName), join(beforeScopeFolder, migrationName), {
        recursive: true,
      });
    }

    try {
      db = await createDatabase(dbPath);
      await migrateDatabase(db, dbPath, beforeScopeFolder);

      // Raw SQL for the same reason as the Runs below: the `projects` builder reflects today's
      // schema, which has columns this migration state does not.
      const project = { id: 'project-1' };
      await db.run(sql`
        INSERT INTO projects (id, created_at, updated_at, url, name, aliases)
        VALUES (${project.id}, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'https://example.com', 'Example', '[]')
      `);
      await db.run(sql`
        INSERT INTO topics (id, created_at, updated_at, name, project_id, is_archived)
        VALUES ('topic-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'Topic', ${project.id}, 0)
      `);
      await db.run(sql`
        INSERT INTO prompts (id, created_at, updated_at, name, topic_id, project_id, is_archived)
        VALUES ('prompt-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'Prompt', 'topic-1', ${project.id}, 0)
      `);
      // Raw SQL, not the drizzle `collectionRuns`/`collectionRunItems` insert builders: those
      // reflect today's schema (which has `scope`) and the table at this migration state does not
      // have that column yet.
      await db.run(sql`
        INSERT INTO collection_runs (id, status, started_at, finished_at, items_total, items_completed, items_failed, error, created_at)
        VALUES ('run-1', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', 2, 2, 0, NULL, '2026-01-01T00:00:00Z')
      `);
      await db.run(sql`
        INSERT INTO collection_run_items (id, run_id, project_id, prompt_id, chatbot_id, status, attempts, error, started_at, finished_at, created_at)
        VALUES ('item-1', 'run-1', ${project.id}, 'prompt-1', 'chatgpt', 'completed', 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', '2026-01-01T00:00:00Z')
      `);
      await db.run(sql`
        INSERT INTO collection_run_items (id, run_id, project_id, prompt_id, chatbot_id, status, attempts, error, started_at, finished_at, created_at)
        VALUES ('item-2', 'run-1', ${project.id}, 'prompt-1', 'perplexity', 'completed', 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', '2026-01-01T00:00:00Z')
      `);
      closeDatabase(db);

      // Now apply the app's real, full migration sequence, including add_collection_runs_scope.
      db = await createDatabase(dbPath);
      await migrateDatabase(db, dbPath);

      const runRows = await db.select().from(collectionRuns);
      expect(runRows).toHaveLength(1);
      expect(runRows[0].id).toBe('run-1');
      expect(runRows[0].scope).toBe('all');

      const itemRows = await db.select().from(collectionRunItems);
      expect(itemRows.map((row) => row.id).sort()).toEqual(['item-1', 'item-2']);
    } finally {
      rmSync(beforeScopeFolder, { recursive: true, force: true });
    }
  });
});
