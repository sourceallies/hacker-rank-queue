import { WebClient } from '@/slackTypes';
import { codeBlock, compose, errorStack, textBlock, titleBlock } from './text';

/**
 * Creates a handler that can be passed into the `catch` callback of a promise. Used to report an
 * error to our errors channel, but not stop the process. See example below:
 *
 * @example
 * await someAsyncFunction(...args)
 *   .catch(reportErrorAndContinue(app, 'Some error', { someData }));
 *
 * @param app A reference to the bolt app so it can post a message to the error channel
 * @param title Custom text to show at the beginning of the message
 * @param customData Any custom data that will provide context around the variables present when the
 *                   error was thrown
 */
export const reportErrorAndContinue =
  <T>(app: { client: WebClient }, title: string, customData: T) =>
  async (err: Error): Promise<void> => {
    const { ts } = await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.ERRORS_CHANNEL_ID,
      blocks: [titleBlock(err.message), textBlock(title)],
    });
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.ERRORS_CHANNEL_ID,
      thread_ts: ts,
      text: compose(
        'Stack Trace:',
        codeBlock(errorStack(err)),
        'Context:',
        codeBlock(JSON.stringify(customData, null, 2)),
      ),
    });
  };
