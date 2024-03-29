import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { declineReviewRequest } from '@bot/declineReviewRequest';
import { joinQueue } from '@bot/joinQueue';
import { leaveQueue } from '@bot/leaveQueue';
import { requestReview } from '@bot/requestReview';
import { triggerCron } from '@bot/triggerCron';
import { requestPosition } from '@bot/requestPosition';
import { database } from '@database';
import { App, ExpressReceiver } from '@slack/bolt';
import log from '@utils/log';
import { setupCronJobs } from './cron';
import { getReviewInfo } from '@bot/getReviewInfo';

export async function startApp(): Promise<void> {
  // Check connection to google sheets
  await database.open();
  log.d('app.startApp', 'Mode:', process.env.MODE);
  log.d('app.startApp', 'Connected to Google Sheets!');

  // Add custom endpoints
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });
  receiver.router.get('/api/health', (_, res) => {
    res.sendStatus(204);
  });

  // Setup Slack App
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: receiver,
  });

  // Define shortcuts
  joinQueue.setup(app);
  leaveQueue.setup(app);
  requestReview.setup(app);
  acceptReviewRequest.setup(app);
  declineReviewRequest.setup(app);
  requestPosition.setup(app);
  getReviewInfo.setup(app);

  // Schedule cron jobs
  const triggerAllJobs = setupCronJobs(app);
  if (process.env.MODE === 'dev') {
    triggerCron.setup(app, triggerAllJobs);
  }

  let port = Number(process.env.PORT);
  if (!port || isNaN(port)) port = 3000;
  app.start(port);
  log.d('app.startApp', `Slack app started on :${port}`);
}
