import { healthCheck } from '@cron/healthCheck';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { schedule } from 'node-cron';
import { reviewCloser } from './reviewCloser';
import { reviewProcessor } from './reviewProcessor';

type ScheduledJob = [string, (app: App) => void | Promise<void>];

const jobs: ScheduledJob[] = [
  // Midnight every day
  ['0 0 * * *', healthCheck],

  // Every 15 minutes from 8am-5pm, weekdays only
  ['*/15 8-17 * * MON-FRI', reviewProcessor],

  // Every 15 minutes from 8:15am-5pm, weekdays only
  ['5/15 8-17 * * MON-FRI', reviewCloser],
];

async function errorHandler(app: App, callback: (app: App) => void | Promise<void>): Promise<void> {
  try {
    await callback(app);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    log.e('cron.errorHandler', 'Uncaught exception:', err.message);
    log.e('cron.errorHandler', err);
  }
}

export function setupCronJobs(app: App): () => void {
  const scheduledJobs = jobs.map(([cronExpression, executor]) => {
    const scheduledJob = () => errorHandler(app, executor);
    schedule(cronExpression, scheduledJob, {
      timezone: 'America/Chicago',
    });
    return scheduledJob;
  });

  return function triggerAllJobs() {
    log.d('cron.triggerAllJobs', `Triggering ${scheduledJobs.length} jobs`);
    scheduledJobs.forEach(scheduledJob => scheduledJob());
  };
}
