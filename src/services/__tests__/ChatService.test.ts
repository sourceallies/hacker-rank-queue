import { buildMockWebClient } from '@utils/slackMocks';
import { chatService } from '@/services/ChatService';
import { Block } from '@slack/bolt';
import { Deadline, DeadlineLabel } from '@bot/enums';

describe('ChatService', () => {
  const OLD_ENV = process.env;

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.SLACK_BOT_TOKEN = 'slack-bot-token';
    process.env.INTERVIEWING_CHANNEL_ID = 'interviewing-channel-id';
  });

  describe('replyToReviewThread', () => {
    it('should post the provided message onto the given thread', async () => {
      const client = buildMockWebClient();
      const threadId = '123.00050';
      const text = 'This is a message';

      client.chat.postMessage = jest.fn().mockResolvedValue({
        ts: '1234',
      });

      await chatService.replyToReviewThread(client, threadId, text);

      expect(client.chat.postMessage).toHaveBeenCalledWith({
        token: 'slack-bot-token',
        thread_ts: threadId,
        channel: 'interviewing-channel-id',
        text: text,
      });
    });
  });

  describe('updateDirectMessage', () => {
    it('should update the original message in the provided channel', async () => {
      const client = buildMockWebClient();
      const userId = 'my-user-id';
      const blocks: Block[] = [];
      const directMessageId = '2113';

      client.conversations.open = jest.fn().mockResolvedValue({ channel: { id: directMessageId } });

      await chatService.updateDirectMessage(client, userId, '1234', blocks);

      expect(client.chat.update).toHaveBeenCalledWith({
        channel: directMessageId,
        token: 'slack-bot-token',
        ts: '1234',
        blocks: blocks,
      });
    });
  });

  describe('sendRequestReviewMessage', () => {
    it('should notify the given user that a request is ready for them to review', async () => {
      const client = buildMockWebClient();
      client.chat.postMessage = jest.fn().mockResolvedValue({
        ts: '1234',
      });
      const reviewerId = '123';
      const threadId = '456';
      const requestorId = '789';
      const languages = ['Java', 'Python'];
      // prettier-ignore
      const requestBlock = `<@${requestorId}> has requested a HackerRank done in the following languages:

  •  ${languages[0]}
  •  ${languages[1]}

*The review is needed by: End of day*`;
      await chatService.sendRequestReviewMessage(
        client,
        reviewerId,
        threadId,
        { id: requestorId },
        languages,
        DeadlineLabel.get(Deadline.END_OF_DAY) || '',
      );

      expect(client.chat.postMessage).toHaveBeenCalledWith({
        blocks: [
          {
            block_id: 'reviewer-dm-context',
            text: {
              text: requestBlock,
              type: 'mrkdwn',
            },
            type: 'section',
          },
          {
            block_id: 'reviewer-dm-buttons',
            elements: [
              {
                action_id: 'reviewer-dm-accept',
                style: 'primary',
                text: {
                  text: 'Accept',
                  type: 'plain_text',
                },
                type: 'button',
                value: threadId,
              },
              {
                action_id: 'reviewer-dm-deny',
                style: 'danger',
                text: {
                  text: 'Decline',
                  type: 'plain_text',
                },
                type: 'button',
                value: threadId,
              },
            ],
            type: 'actions',
          },
        ],
        channel: reviewerId,
        text: 'HackerRank review requested',
        token: 'slack-bot-token',
      });
    });
  });
});
