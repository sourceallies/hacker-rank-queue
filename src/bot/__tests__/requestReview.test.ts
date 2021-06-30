import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { BOT_ICON_URL, BOT_USERNAME } from '@bot/constants';
import { ActionId, Deadline, Interaction } from '@bot/enums';
import { requestReview } from '@bot/requestReview';
import { languageRepo } from '@repos/languageRepo';
import { App, SlackViewAction } from '@slack/bolt';
import {
  buildMockCallbackParam,
  buildMockShortcutParam,
  buildMockViewOutput,
  buildMockViewOutputBlock,
} from '@utils/slackMocks';

describe('requestReview', () => {
  describe('setup', () => {
    let app: App;
    const boundShortcutMethod = jest.fn();
    const boundCallbackMethod = jest.fn();

    beforeEach(() => {
      app = {
        shortcut: jest.fn() as any,
        view: jest.fn() as any,
      } as App;
      requestReview.shortcut.bind = jest.fn().mockReturnValueOnce(boundShortcutMethod);
      requestReview.callback.bind = jest.fn().mockReturnValueOnce(boundCallbackMethod);

      requestReview.setup(app);
    });

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
    describe('when no errors occur', () => {
      let param: ShortcutParam;

      beforeEach(async () => {
        param = buildMockShortcutParam();
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
          type: 'input',
          label: {
            text: 'When do you need this reviewed by?',
            type: 'plain_text',
          },
          element: {
            type: 'static_select',
            action_id: ActionId.REVIEW_DEADLINE,
            options: [
              { text: { text: 'End of day', type: 'plain_text' }, value: Deadline.END_OF_DAY },
              { text: { text: 'Tomorrow', type: 'plain_text' }, value: Deadline.TOMORROW },
              { text: { text: 'End of week', type: 'plain_text' }, value: Deadline.END_OF_WEEK },
              { text: { text: 'Monday', type: 'plain_text' }, value: Deadline.MONDAY },
              { text: { text: 'Other', type: 'plain_text' }, value: Deadline.NONE },
            ],
          },
        });
      });

      it('should setup the third response block for the number of reviewers necessary', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[2]).toEqual({
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
    });

    describe('when the language cannot be retrieved', () => {
      let param: ShortcutParam;

      beforeEach(async () => {
        param = buildMockShortcutParam();
        languageRepo.listAll = jest.fn().mockRejectedValueOnce('language repo error');

        await requestReview.shortcut(param);
      });

      it('should attempt to load the available languages', () => {
        expect(languageRepo.listAll).toBeCalled();
      });

      it('should send a message letting the user know that something went wrong', () => {
        expect(param.client.chat.postMessage).toBeCalledWith({
          channel: param.shortcut.user.id,
          text: expect.any(String),
          username: BOT_USERNAME,
          icon_url: BOT_ICON_URL,
        });
      });

      it('should not show the "Request a Review" dialog', () => {
        expect(param.client.views.open).not.toBeCalled();
      });
    });

    describe('when the dialog fails to show', () => {
      let param: ShortcutParam;

      beforeEach(async () => {
        param = buildMockShortcutParam();
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
          channel: param.shortcut.user.id,
          text: expect.any(String),
          username: BOT_USERNAME,
          icon_url: BOT_ICON_URL,
        });
      });
    });
  });

  describe('callback', () => {
    let param: CallbackParam;
    const languageBlock = buildMockViewOutputBlock({ block_id: 'languages_block_id' });
    const deadlineBlock = buildMockViewOutputBlock({ block_id: 'deadline_block_id' });
    const numberOfReviewersBlock = buildMockViewOutputBlock({
      block_id: 'number_of_reviewers_block_id',
    });
    const interviewingChannelId = 'some-channel-id';

    beforeEach(async () => {
      process.env.INTERVIEWING_CHANNEL_ID = interviewingChannelId;
      param = buildMockCallbackParam({
        body: {
          user: {
            id: 'submitter-user-id',
          },
          view: buildMockViewOutput({
            blocks: {
              0: languageBlock,
              1: deadlineBlock,
              2: numberOfReviewersBlock,
            },
            state: {
              values: {
                [languageBlock.block_id!]: {
                  [ActionId.LANGUAGE_SELECTIONS]: {
                    type: 'checkboxes',
                    selected_options: [{ value: 'Go' }, { value: 'Javascript' }],
                  },
                },
                [deadlineBlock.block_id!]: {
                  [ActionId.REVIEW_DEADLINE]: {
                    type: 'static_select',
                    selected_option: {
                      text: { text: 'Tomorrow' },
                      value: Deadline.TOMORROW,
                    },
                  },
                },
                [numberOfReviewersBlock.block_id!]: {
                  [ActionId.NUMBER_OF_REVIEWERS]: {
                    type: 'plain_text_input',
                    value: '1',
                  },
                },
              },
            },
          }),
        } as SlackViewAction,
      });

      await requestReview.callback(param);
    });

    it("should acknowledge the request so slack knows we're handling the dialog submission", () => {
      expect(param.ack).toBeCalled();
    });

    it('should post a message to the interviewing channel', async () => {
      expect(param.client.chat.postMessage).toBeCalledWith({
        channel: interviewingChannelId,
        text: `
<@${param.body.user.id}> has requested 1 reviews for a HackerRank done in the following languages:

- Go
- Javascript

*The review is needed by: Tomorrow*
        `.trim(),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    });
  });
});
