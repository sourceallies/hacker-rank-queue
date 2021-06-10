import { joinQueue } from '@bot/joinQueue';
import { leaveQueue } from '@bot/leaveQueue';
import { database } from '@database';
import { App, ExpressReceiver } from '@slack/bolt';

export async function startApp(): Promise<void> {
  // Check connection to google sheets
  const db = await database.open();
  console.log('Connected to Google Sheets!', db.title);

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

  joinQueue.setup(app);
  leaveQueue.setup(app);

  let port = Number(process.env.PORT);
  if (!port || isNaN(port)) port = 3000;
  app.start(port);
  console.log(`Slack app started on :${port}`);
}
