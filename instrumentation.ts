export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { getDatabase } = await import('./libs/database/client');
  const { migrateDatabase } = await import('./libs/database/migrate');
  const { getDatabasePath } = await import('./libs/database/paths');
  const { restrictDatabaseFilePermissions } = await import('./libs/database/permissions');

  const db = await getDatabase();
  const dbPath = getDatabasePath();
  await migrateDatabase(db, dbPath);

  await restrictDatabaseFilePermissions(dbPath);

  await resumeAndStartCollectionRunLoop();
}

// A resume failure must not stop the server booting (same posture as
// `restrictDatabaseFilePermissions` above) — the loop can still pick up any Run that is genuinely
// `pending`, it would just miss recovering one orphaned `running` by a previous kill until the
// next boot.
async function resumeAndStartCollectionRunLoop(): Promise<void> {
  try {
    const {
      releaseRunningCollectionRuns,
      ensureCollectionRunLoopIsRunning,
      startCollectionScheduler,
    } = await import('./libs/collection');
    await releaseRunningCollectionRuns();
    ensureCollectionRunLoopIsRunning();

    // After the resume above, so a Run released from a previous kill is not mistaken for none.
    startCollectionScheduler();

    // The mirror image, for the other end of the process's life. `bunx allsearch` runs the server
    // inside the CLI process and owns SIGINT/SIGTERM (issue 20); this is how the server-side work
    // that has to happen before exit gets back to it, since the CLI cannot import into the
    // standalone server bundle. Registered here rather than in the CLI because the database
    // access has to happen on this side of the bundle boundary.
    const { registerShutdownHook } = await import('./libs/shutdown');
    registerShutdownHook('collection-runs', releaseRunningCollectionRuns);
  } catch (error) {
    console.error('Failed to resume Collection Runs', error);
  }
}
