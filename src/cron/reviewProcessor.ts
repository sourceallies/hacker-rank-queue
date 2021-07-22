import log from '@utils/log';
import { RequestService } from '@services';
import { App } from '@slack/bolt';
import { codeBlock, compose } from '@/utils/text';

interface ExpiredRequest {
  review: unknown;
  userId: string;
}

// TODO: scrap once this type exists
interface Review {}

export async function reviewProcessor(app: App): Promise<void> {
  log.w('cron.reviewProcessor', 'Not implemented :(');

  const reviews: Review[] = await [];
  const expiredRequests = reviews.flatMap((review): ExpiredRequest[] => {
    return [{ review, userId: 'user-id' }];
  });

  // Notify users their time is up and request the next person
  for (const { review, userId } of expiredRequests) {
    const catchError = async (err: Error) => {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: process.env.ERRORS_CHANNEL_ID,
        text: compose(
          'Unknown error when trying to notify a reviewer that their time has ran out',
          codeBlock(err.message),
          codeBlock(JSON.stringify({ review, userId }, null, 2)),
        ),
      });
    };
    await RequestService.expireRequest(app.client, review, userId).catch(catchError);
  }
}
