import { testJob } from '@cron/testJob';
import { App } from '@slack/bolt';
import { schedule } from 'node-cron';

type ScheduledJob = [string, (app: App) => void | Promise<void>];

export function setupCronJobs(app: App): () => void {
  // prettier-ignore
  const jobs: ScheduledJob[] = [
    ['* * * * *', testJob],
  ];

  jobs.forEach(([cronExpression, executor]) => schedule(cronExpression, () => executor));

  return function triggerAllJobs() {
    jobs.forEach(([_, executor]) => executor(app));
  };
}
