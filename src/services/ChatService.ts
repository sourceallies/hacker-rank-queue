import { ChatResponse, WebClient } from '@/slackTypes';
import { Block } from '@slack/bolt';
import { requestBuilder } from '@utils/RequestBuilder';
import { KnownBlock } from '@slack/types';

export const chatService = {
  /**
   * Adds the provided `text` as a response to the thread with the given `threadId`
   */
  async replyToReviewThread(
    client: WebClient,
    threadId: string,
    text: string,
  ): Promise<ChatResponse> {
    return this.postInThread(client, process.env.INTERVIEWING_CHANNEL_ID, threadId, text);
  },

  /**
   * Updates the original message in the given `channel` to have the provided `blocks`
   */
  async updateDirectMessage(
    client: WebClient,
    userId: string,
    messageTimestamp: string,
    blocks: (KnownBlock | Block)[],
  ): Promise<ChatResponse> {
    const directMessageId = await this.getDirectMessageId(client, userId);
    return client.chat.update({
      token: process.env.SLACK_BOT_TOKEN,
      channel: directMessageId,
      ts: messageTimestamp,
      blocks: blocks,
    });
  },

  async postTextMessage(client: WebClient, channel: string, text: string): Promise<ChatResponse> {
    return client.chat.postMessage({
      channel: channel,
      text: text,
      token: process.env.SLACK_BOT_TOKEN,
    });
  },

  async sendDirectMessage(client: WebClient, userId: string, text: string): Promise<ChatResponse> {
    const directMessageId = await this.getDirectMessageId(client, userId);
    return this.postTextMessage(client, directMessageId, text);
  },

  async postBlocksMessage(
    client: WebClient,
    channel: string,
    blocks: KnownBlock[],
  ): Promise<ChatResponse> {
    return client.chat.postMessage({
      channel: channel,
      blocks: blocks,
      token: process.env.SLACK_BOT_TOKEN,
    });
  },

  async postInThread(
    client: WebClient,
    channel: string,
    ts: string | undefined,
    text: string,
  ): Promise<ChatResponse> {
    return client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      thread_ts: ts,
      channel: channel,
      text: text,
    });
  },

  async getDirectMessageId(client: WebClient, userId: string): Promise<string> {
    const { channel } = await client.conversations.open({
      token: process.env.SLACK_BOT_TOKEN,
      users: userId,
    });
    if (!channel?.id) {
      throw Error(`Unable to open direct message with user ${userId}`);
    }
    return channel.id;
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
    const requestWithToken = {
      ...request,
      token: process.env.SLACK_BOT_TOKEN,
    };
    const message = await client.chat.postMessage(requestWithToken);
    if (!message.ts) {
      throw new Error('No timestamp included on request review message response');
    }
    return message.ts;
  },
};
