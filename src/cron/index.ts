import { healthCheck } from '@cron/healthCheck';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { schedule } from 'node-cron';
import { expireRequests } from './expireRequests';
import { checkAllUsersActive } from '@cron/checkAllUsersActive';
import { CRON_EXPIRE_REQUESTS_INTERVAL_MINUTES } from '@utils/constants';

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

const CRON_SCHEDULE_MIDNIGHT = '0 0 * * *';
const CRON_SCHEDULE_12_05_AM = '5 0 * * *';

function getJobs(): ScheduledJob[] {
  const expireRequestsSchedule = `*/${CRON_EXPIRE_REQUESTS_INTERVAL_MINUTES} ${process.env.WORKDAY_START_HOUR}-${process.env.WORKDAY_END_HOUR} * * MON-FRI`;
  return [
    // Midnight every day
    [CRON_SCHEDULE_MIDNIGHT, healthCheck],
    // 12:05 AM every day
    [CRON_SCHEDULE_12_05_AM, checkAllUsersActive],
    [expireRequestsSchedule, expireRequests],
  ];
}
