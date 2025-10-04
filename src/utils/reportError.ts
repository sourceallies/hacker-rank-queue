import { WebClient } from '@/slackTypes';
import { codeBlock, compose, errorStack, textBlock, titleBlock } from './text';
import { chatService } from '@/services/ChatService';
import log from '@utils/log';

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
    log.e('reportErrorAndContinue', title, customData, err.message, err.stack);
    const response = await chatService.postBlocksMessage(
      app.client,
      process.env.ERRORS_CHANNEL_ID,
      [titleBlock(err.message), textBlock(title)],
    );
    if (response?.ts) {
      await chatService.postInThread(
        app.client,
        process.env.ERRORS_CHANNEL_ID,
        response.ts,
        compose(
          'Stack Trace:',
          codeBlock(errorStack(err)),
          'Context:',
          codeBlock(JSON.stringify(customData, null, 2)),
        ),
      );
    }
  };
