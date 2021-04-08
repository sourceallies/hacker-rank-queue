import { App } from '@slack/bolt';
import { joinQueue } from '@bot/joinQueue';

export async function startApp(): Promise<void> {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  // Setup events, listeners, and flows
  joinQueue.setup(app);

  // Spin it up
  let port = Number(process.env.PORT);
  if (!port || isNaN(port)) port = 3000;
  app.start(port);
  console.log(`Slack app started on :${port}`);
}
