import 'server-only';

import { getActiveCollectionRunRow } from '@/libs/database/CollectionRuns/queries';
import { getProjectRows } from '@/libs/database/Projects/queries';
import { getEffectiveEnabledChatbotIds } from '@/libs/database/Settings/queries';
import { createCollectionRun } from './collectionRun';
import { ensureCollectionRunLoopIsRunning } from './runLoop';
import { isCollectionScheduleDue } from './schedule';

const SCHEDULE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Starts one Collection Run covering every Project whose own schedule is due. Returns the ids it
 * started for. Each Project anchors on `prompts_updated_at`, which every Run touching it writes. */
export async function startScheduledCollectionRunIfDue(now = new Date()): Promise<string[]> {
  // Scope 'projects' Runs are not guarded against overlap, and `prompts_updated_at` is only written
  // when a Run finishes, so a Run still in flight would look due again. Wait for it instead.
  if (await getActiveCollectionRunRow()) return [];

  const dueProjectIds = (await getProjectRows(false))
    .filter(
      (project) =>
        !project.is_paused &&
        project.collection_schedule &&
        isCollectionScheduleDue(
          project.collection_schedule,
          project.prompts_updated_at ? new Date(project.prompts_updated_at) : null,
          now
        )
    )
    .map((project) => project.id);
  if (!dueProjectIds.length) return [];

  // With no Chatbot enabled the Run would collect nothing; skip until a key is added.
  if (!(await getEffectiveEnabledChatbotIds()).length) return [];

  await createCollectionRun({ projectIds: dueProjectIds });
  ensureCollectionRunLoopIsRunning();
  return dueProjectIds;
}

// `instrumentation.ts` can run more than once per process in dev, so keep a single timer.
const globalForScheduler = globalThis as unknown as { __collectionScheduler?: NodeJS.Timeout };

/** Checks the schedules now (to catch up on Runs that came due while the app was closed) and then
 * every 15 minutes. Runs only while the app is open: no daemon, no launch-at-login (ADR 0011). */
export function startCollectionScheduler(): void {
  if (globalForScheduler.__collectionScheduler) return;

  const check = async () => {
    try {
      const projectIds = await startScheduledCollectionRunIfDue();
      if (projectIds.length) {
        console.log(`Scheduled Collection Run started for ${projectIds.length} Project(s)`);
      }
    } catch (error) {
      // A failed check must not kill the timer: the next one may well succeed.
      console.error('Scheduled Collection Run check failed', error);
    }
  };

  // ponytail: 15-minute poll, so a Run can start up to 15 minutes after local midnight / boot.
  const timer = setInterval(check, SCHEDULE_CHECK_INTERVAL_MS);
  // Never keep the process alive just for this: the CLI owns shutdown (libs/shutdown.ts).
  timer.unref();
  globalForScheduler.__collectionScheduler = timer;
  void check();
}
