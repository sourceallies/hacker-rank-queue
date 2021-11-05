import { WebClient } from '@/slackTypes';
import { Block, BlockAction, ButtonAction } from '@slack/bolt';

export const chatService = {
  /**
   * Adds the provided `text` as a response to the thread with the given `threadId`
   */
  async replyToReviewThread(client: WebClient, threadId: string, text: string): Promise<void> {
    await client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      thread_ts: threadId,
      channel: process.env.INTERVIEWING_CHANNEL_ID,
      text: text,
    });
    return Promise.resolve();
  },

  /**
   * Updates the original message in the given `channel` to have the provided `blocks`
   */
  async updateMessage(
    client: WebClient,
    channel: string,
    body: BlockAction<ButtonAction>,
    blocks: Block[],
  ): Promise<void> {
    if (!body.message) {
      throw new Error(`Unable to update message in ${channel}. Body has no message.`);
    }

    await client.chat.update({
      channel: channel,
      ts: body.message.ts,
      blocks: blocks,
    });
    return Promise.resolve();
  },
};
