import { App } from '@slack/bolt';
import { setupShortcuts } from '@shortcuts';

export async function startApp(): Promise<void> {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  setupShortcuts(app);

  let port = Number(process.env.PORT);
  if (!port || isNaN(port)) port = 3000;
  app.start(port);

  console.log(`Slack app started on :${port}`);
}
