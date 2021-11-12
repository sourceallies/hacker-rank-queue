import { WebClient } from '@/slackTypes';
import { Block } from '@slack/bolt';
import { BOT_ICON_URL, BOT_USERNAME } from '@bot/constants';
import { requestBuilder } from '@utils/RequestBuilder';

export const chatService = {
  /**
   * Adds the provided `text` as a response to the thread with the given `threadId`
   */
  async replyToReviewThread(client: WebClient, threadId: string, text: string): Promise<void> {
    await client.chat.postMessage({
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
      token: process.env.SLACK_BOT_TOKEN,
      thread_ts: threadId,
      channel: process.env.INTERVIEWING_CHANNEL_ID,
      text: text,
    });
  },

  /**
   * Updates the original message in the given `channel` to have the provided `blocks`
   */
  async updateMessage(
    client: WebClient,
    channel: string,
    ts: string,
    blocks: Block[],
  ): Promise<void> {
    await client.chat.update({
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
      token: process.env.SLACK_BOT_TOKEN,
      channel: channel,
      ts: ts,
      blocks: blocks,
    });
  },

  async sendRequestReviewMessage(
    client: WebClient,
    reviewerId: string,
    threadId: string,
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
  ): Promise<string> {
    const request = requestBuilder.buildReviewRequest(
      reviewerId,
      threadId,
      requestor,
      languages,
      deadlineDisplay,
    );
    const message = await client.chat.postMessage(request);
    if (!message.ts) {
      throw new Error('No timestamp included on request review message response');
    }
    return message.ts;
  },
};
