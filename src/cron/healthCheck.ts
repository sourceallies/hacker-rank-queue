import { database } from '@database';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { codeBlock, compose } from '@utils/text';
import { chatService } from '@/services/ChatService';

export async function healthCheck(app: App): Promise<void> {
  try {
    // Database
    await database.open();
    log.d('cron.testJob', '✔ Spreadsheet access');

    // Slack Auth
    await app.client.auth.test({ token: process.env.SLACK_BOT_TOKEN });
    log.d('cron.testJob', '✔ Bot is authenticated');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    log.e('cron.healthCheck', 'Health check failed:', err.message);
    log.e('cron.healthCheck', err);
    if (process.env.MODE === 'prod') {
      await chatService.postTextMessage(
        app.client,
        process.env.ERRORS_CHANNEL_ID,
        compose('Nightly health check failed:', codeBlock(err.message)),
      );
    }
  }
}
