import { buildMockBlockAction, buildMockWebClient } from '@utils/slackMocks';
import { chatService } from '@/services/ChatService';
import { Block } from '@slack/bolt';

describe('ChatService', () => {
  const OLD_ENV = process.env;

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('replyToReviewThread', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.SLACK_BOT_TOKEN = 'slack-bot-token';
      process.env.INTERVIEWING_CHANNEL_ID = 'interviewing-channel-id';
    });

    it('should post the provided message onto the given thread', async () => {
      const client = buildMockWebClient();
      const threadId = '123.00050';
      const text = 'This is a message';

      client.chat.postMessage = jest.fn().mockResolvedValue(true);

      await chatService.replyToReviewThread(client, threadId, text);

      expect(client.chat.postMessage).toHaveBeenCalledWith({
        token: 'slack-bot-token',
        thread_ts: threadId,
        channel: 'interviewing-channel-id',
        text: text,
      });
    });
  });

  describe('updateMessage', () => {
    it('should throw an exception if no message exists on the body', async () => {
      const client = buildMockWebClient();
      const channel = 'my-channel-id';
      const body = buildMockBlockAction();
      body.message = undefined;
      const blocks: Block[] = [];

      await expect(chatService.updateMessage(client, channel, body, blocks)).rejects.toThrow(
        'Unable to update message in my-channel-id. Body has no message.',
      );
    });

    it('should update the original message in the provided channel', async () => {
      const client = buildMockWebClient();
      const channel = 'my-channel-id';
      const body = buildMockBlockAction();
      const blocks: Block[] = [];

      await chatService.updateMessage(client, channel, body, blocks);

      expect(client.chat.update).toHaveBeenCalledWith({
        channel: channel,
        ts: '1234',
        blocks: blocks,
      });
    });
  });
});
