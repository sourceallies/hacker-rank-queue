import { healthCheck } from '@cron/healthCheck';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { schedule } from 'node-cron';
import { expireRequests } from './expireRequests';

type ScheduledJob = [string, (app: App) => void | Promise<void>];

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
  const scheduledJobs = getJobs().map(([cronExpression, executor]) => {
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

function getJobs(): ScheduledJob[] {
  const everyFifteenWorkDay = `*/15 ${process.env.WORKDAY_START_HOUR}-${process.env.WORKDAY_END_HOUR} * * MON-FRI`;
  return [
    // Midnight every day
    ['0 0 * * *', healthCheck],
    [everyFifteenWorkDay, expireRequests],
  ];
}
