import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { QueueService } from '@/services';
import { chatService } from '@/services/ChatService';
import { ShortcutParam } from '@/slackTypes';
import { ActionId, Deadline, Interaction } from '@bot/enums';
import { requestReview } from '@bot/requestReview';
import { languageRepo } from '@repos/languageRepo';
import { App, SlackViewAction, UploadedFile, ViewStateValue } from '@slack/bolt';
import {
  buildMockCallbackParam,
  buildMockShortcutParam,
  buildMockViewOutput,
  buildMockWebClient,
} from '@utils/slackMocks';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import log from '@utils/log';
import { mockEnvVariables } from '@/utils/testUtils';

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn();
  return {
    S3Client: jest.fn(() => ({
      send,
    })),
    PutObjectCommand: jest.fn(() => ({})),
  };
});

global.fetch = jest.fn(async () => ({
  arrayBuffer: async () => new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer,
})) as jest.Mock;

mockEnvVariables({
  HACK_PARSER_BUCKET_NAME: 'hack-parser-bucket-name',
});

const DIRECT_MESSAGE_ID = '1234';

describe('requestReview', () => {
  let app: App;
  const boundShortcutMethod = jest.fn();
  const boundCallbackMethod = jest.fn();

  beforeEach(() => {
    app = {
      shortcut: jest.fn() as any,
      view: jest.fn() as any,
      client: buildMockWebClient(),
    } as App;
    requestReview.shortcut.bind = jest.fn().mockReturnValueOnce(boundShortcutMethod);
    requestReview.callback.bind = jest.fn().mockReturnValueOnce(boundCallbackMethod);

    requestReview.setup(app);
  });

  describe('setup', () => {
    it('should run shortcut() when the "Request a Review" shortcut is pressed', () => {
      expect(requestReview.shortcut.bind).toBeCalledWith(requestReview);
      expect(app.shortcut).toBeCalledWith(Interaction.SHORTCUT_REQUEST_REVIEW, boundShortcutMethod);
    });

    it('should run callback() after the user submits the "Request a Review" dialog', () => {
      expect(requestReview.callback.bind).toBeCalledWith(requestReview);
      expect(app.view).toBeCalledWith(Interaction.SUBMIT_REQUEST_REVIEW, boundCallbackMethod);
    });
  });

  describe('shortcut', () => {
    let param: ShortcutParam;
    beforeEach(() => {
      param = buildMockShortcutParam();
      param.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });
    });

    describe('when no errors occur', () => {
      beforeEach(async () => {
        languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Javascript', 'Go', 'Other']);

        await requestReview.shortcut(param);
      });

      it("should acknowledge the request so slack knows we're working on it", () => {
        expect(param.ack).toBeCalled();
      });

      it("should show a dialog who's submit button triggers the callback() function", () => {
        expect(param.client.views.open).toBeCalledWith({
          trigger_id: param.shortcut.trigger_id,
          view: expect.objectContaining({
            title: {
              text: 'Request a Review',
              type: 'plain_text',
            },
            type: 'modal',
            callback_id: Interaction.SUBMIT_REQUEST_REVIEW,
            submit: {
              type: 'plain_text',
              text: 'Submit',
            },
          }),
        });
      });

      it('should setup the first response block for the languages used', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[0]).toEqual({
          block_id: ActionId.LANGUAGE_SELECTIONS,
          type: 'input',
          label: {
            text: 'What languages were used?',
            type: 'plain_text',
          },
          element: {
            type: 'checkboxes',
            action_id: ActionId.LANGUAGE_SELECTIONS,
            options: [
              { text: { text: 'Javascript', type: 'plain_text' }, value: 'Javascript' },
              { text: { text: 'Go', type: 'plain_text' }, value: 'Go' },
              { text: { text: 'Other', type: 'plain_text' }, value: 'Other' },
            ],
          },
        });
      });

      it('should setup the second response block for when the reviews are needed by', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[1]).toEqual({
          block_id: ActionId.REVIEW_DEADLINE,
          type: 'input',
          label: {
            text: 'When do you need this reviewed by?',
            type: 'plain_text',
          },
          element: {
            type: 'static_select',
            action_id: ActionId.REVIEW_DEADLINE,
            options: [
              { text: { text: 'Today', type: 'plain_text' }, value: Deadline.END_OF_DAY },
              { text: { text: 'Monday', type: 'plain_text' }, value: Deadline.MONDAY },
              { text: { text: 'Tuesday', type: 'plain_text' }, value: Deadline.TUESDAY },
              { text: { text: 'Wednesday', type: 'plain_text' }, value: Deadline.WEDNESDAY },
              { text: { text: 'Thursday', type: 'plain_text' }, value: Deadline.THURSDAY },
              { text: { text: 'Friday', type: 'plain_text' }, value: Deadline.FRIDAY },
            ],
          },
        });
      });

      it('should setup the third response block for the number of reviewers necessary', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[2]).toEqual({
          block_id: ActionId.NUMBER_OF_REVIEWERS,
          type: 'input',
          label: {
            text: 'How many reviewers are needed?',
            type: 'plain_text',
          },
          element: {
            type: 'plain_text_input',
            action_id: ActionId.NUMBER_OF_REVIEWERS,
            placeholder: { text: 'Enter a number...', type: 'plain_text' },
            initial_value: expect.any(String),
          },
        });
      });

      it('should default the number of reviewers to 2, the number required for a new hire', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[2].element.initial_value).toEqual('2');
      });

      it('should setup the fifth response block for the PDF file input', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[4]).toEqual({
          type: 'input',
          block_id: ActionId.PDF_IDENTIFIER,
          label: {
            text: 'Input PDF File',
            type: 'plain_text',
          },
          element: {
            type: 'file_input',
            action_id: ActionId.PDF_IDENTIFIER,
            max_files: 1,
            filetypes: ['pdf'],
          },
        });
      });

      it('should not setup the fifth response block for the PDF file input when HackParser is not enabled', async () => {
        process.env.HACK_PARSER_BUCKET_NAME = '';

        languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Javascript', 'Go', 'Other']);

        await requestReview.shortcut(param);

        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[1][0].view.blocks;
        expect(blocks[4]).toBeUndefined();
      });
    });

    describe('when the language cannot be retrieved', () => {
      beforeEach(async () => {
        languageRepo.listAll = jest.fn().mockRejectedValueOnce('language repo error');

        await requestReview.shortcut(param);
      });

      it('should attempt to load the available languages', () => {
        expect(languageRepo.listAll).toBeCalled();
      });

      it('should send a message letting the user know that something went wrong', () => {
        expect(param.client.chat.postMessage).toBeCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: expect.any(String),
        });
      });

      it('should not show the "Request a Review" dialog', () => {
        expect(param.client.views.open).not.toBeCalled();
      });
    });

    describe('when the dialog fails to show', () => {
      beforeEach(async () => {
        param.client.views.open = jest.fn().mockRejectedValueOnce('Dialog failed');
        languageRepo.listAll = jest.fn().mockResolvedValueOnce([]);

        await requestReview.shortcut(param);
      });

      it('should load the available languages', () => {
        expect(languageRepo.listAll).toBeCalled();
      });

      it('should attempt to show the "Request a Review" dialog', () => {
        expect(param.client.views.open).toBeCalled();
      });

      it('should send a message letting the user know that something went wrong', () => {
        expect(param.client.chat.postMessage).toBeCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: expect.any(String),
        });
      });
    });
  });

  describe('callback', () => {
    const defaultValues: Record<string, Record<string, ViewStateValue>> = {
      [ActionId.LANGUAGE_SELECTIONS]: {
        [ActionId.LANGUAGE_SELECTIONS]: {
          type: 'checkboxes',
          selected_options: [
            {
              value: 'Go',
              text: { type: 'plain_text', text: 'Go' },
            },
            {
              value: 'Javascript',
              text: { type: 'plain_text', text: 'Javascript' },
            },
          ],
        },
      },
      [ActionId.REVIEW_DEADLINE]: {
        [ActionId.REVIEW_DEADLINE]: {
          type: 'static_select',
          selected_option: {
            text: { type: 'plain_text', text: 'Monday' },
            value: Deadline.MONDAY,
          },
        },
      },
      [ActionId.NUMBER_OF_REVIEWERS]: {
        [ActionId.NUMBER_OF_REVIEWERS]: {
          type: 'plain_text_input',
          value: '1',
        },
      },
      [ActionId.CANDIDATE_IDENTIFIER]: {
        [ActionId.CANDIDATE_IDENTIFIER]: {
          type: 'plain_text_input',
          value: 'some-identifier',
        },
      },
      [ActionId.PDF_IDENTIFIER]: {
        [ActionId.PDF_IDENTIFIER]: {
          type: 'file_input',
          files: [
            {
              id: 'some-file-id',
              name: 'example.pdf',
              url_private_download: 'https://sourceallies.com/some-file-url',
            },
          ] as UploadedFile[],
        },
      },
    };

    async function callCallback(param = buildParam()) {
      process.env.INTERVIEWING_CHANNEL_ID = 'some-channel-id';
      process.env.NUMBER_OF_INITIAL_REVIEWERS = '5';

      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('100');
      QueueService.getInitialUsersForReview = jest.fn().mockResolvedValueOnce([
        {
          id: 'user-id',
          languages: ['Go', 'Javascript', 'SkiffScript'],
          lastReviewedDate: undefined,
        },
      ]);
      activeReviewRepo.create = jest.fn();

      await requestReview.callback(param);

      return { param };
    }

    function buildParam(values: typeof defaultValues = defaultValues) {
      const param = buildMockCallbackParam({
        body: {
          user: {
            id: 'submitter-user-id',
          },
          view: buildMockViewOutput({
            state: {
              values,
            },
          }),
        } as SlackViewAction,
      });
      param.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });
      param.client.chat.postMessage = jest.fn().mockResolvedValueOnce({
        ts: 'some-thread-id',
      });
      return param;
    }

    it("should acknowledge the request so slack knows we're handling the dialog submission", async () => {
      const { param } = await callCallback();

      expect(param.ack).toBeCalled();
    });

    it('should post a message to the interviewing channel', async () => {
      const { param } = await callCallback();

      expect(param.client.chat.postMessage).toBeCalledWith({
        channel: 'some-channel-id',
        text: `
  <@${param.body.user.id}> has requested 1 reviews for a HackerRank done in the following languages:

 •  Go
 •  Javascript

*The review is needed by end of day Monday*

_Candidate Identifier: some-identifier_
          `.trim(),
      });
    });

    it('should get next users to review', async () => {
      await callCallback();

      expect(QueueService.getInitialUsersForReview).toBeCalledWith(['Go', 'Javascript'], 5);
    });

    it('should create a new active review row', async () => {
      const { param } = await callCallback();

      expect(activeReviewRepo.create).toBeCalledWith({
        threadId: 'some-thread-id',
        requestorId: param.body.user.id,
        languages: ['Go', 'Javascript'],
        requestedAt: expect.any(Date),
        dueBy: Deadline.MONDAY,
        candidateIdentifier: 'some-identifier',
        reviewersNeededCount: '1',
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [
          {
            userId: 'user-id',
            expiresAt: expect.any(Number),
            messageTimestamp: '100',
          },
        ],
        pdfIdentifier: 'example.pdf',
      });
    });

    it('should make request to download PDF file with token', async () => {
      await callCallback();

      expect(fetch).toBeCalledWith('https://sourceallies.com/some-file-url', {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
      });
    });

    it('should upload PDF to HackParser S3 bucket', async () => {
      await callCallback();
      const request = {
        Bucket: 'hack-parser-bucket-name',
        Key: 'example.pdf',
        Body: Buffer.from(new Uint16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer),
      };
      expect(PutObjectCommand).toBeCalledWith(request);
      expect(PutObjectCommand).toBeCalledTimes(1);

      expect(new S3Client().send).toBeCalledWith(new PutObjectCommand(request));
      // This does not assert that the request values are the same, just that it was called with *a* PutObjectCommand,
      // hence the above assertion that only one PutObjectCommand was created, therefore the .send was called with *has* to be the one we expected
    });

    it('should work as normal when no PDF is uploaded', async () => {
      const param = buildParam({
        ...defaultValues,
        [ActionId.PDF_IDENTIFIER]: {
          [ActionId.PDF_IDENTIFIER]: {
            type: 'file_input',
          },
        },
      });

      await callCallback(param);

      expect(fetch).not.toHaveBeenCalled();
      expect(S3Client).not.toHaveBeenCalled();
    });

    it('should work as normal when there is an error downloading the PDF from slack', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('Failed to download PDF');
      });

      await callCallback();

      expect(fetch).toBeCalledTimes(1);
      expect(S3Client).not.toHaveBeenCalled();
      expect(log.e).toBeCalledWith(
        'requestReview.callback',
        'Failed to download PDF from slack & upload to HackParser',
        new Error('Failed to download PDF'),
      );
    });

    it('should work as normal when there is an error uploading the PDF to S3', async () => {
      (S3Client as jest.Mock).mockImplementationOnce(() => ({
        send: jest.fn(() => Promise.reject(new Error('Failed to upload PDF'))),
      }));

      await callCallback();

      expect(log.e).toBeCalledWith(
        'requestReview.callback',
        'Failed to download PDF from slack & upload to HackParser',
        new Error('Failed to upload PDF'),
      );
    });

    it('should not run HackParser integration when disabled', async () => {
      process.env.HACK_PARSER_BUCKET_NAME = '';

      await callCallback();

      expect(fetch).not.toHaveBeenCalled();
      expect(S3Client).not.toHaveBeenCalled();
    });
  });
});
