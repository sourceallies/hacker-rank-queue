import { database } from '@database';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { codeBlock, compose } from '@utils/text';

export async function healthCheck(app: App): Promise<void> {
  try {
    // Database
    await database.open();
    log.d('cron.testJob', '✔ Spreadsheet access');

    // Channel history
    await app.client.channels.history({
      channel: process.env.INTERVIEWING_CHANNEL_ID,
      count: 1,
    });
    log.d('cron.testJob', '✔ Access to interviewing channel history');
  } catch (err) {
    log.e('cron.healthCheck', 'Health check failed:', err.message);
    log.e('cron.healthCheck', err);
    if (process.env.MODE === 'prod') {
      app.client.chat.postMessage({
        channel: process.env.ERRORS_CHANNEL_ID,
        text: compose('Nightly health check failed:', codeBlock(err.message)),
      });
    }
  }
}
