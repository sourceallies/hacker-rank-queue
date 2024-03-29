import { QueueService } from '@/services';
import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { ActionId, Deadline, Interaction } from '@bot/enums';
import { requestReview } from '@bot/requestReview';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { languageRepo } from '@repos/languageRepo';
import { reviewTypesRepo } from '@repos/reviewTypesRepo';
import { App, SlackViewAction, ViewStateSelectedOption } from '@slack/bolt';
import {
  buildMockCallbackParam,
  buildMockShortcutParam,
  buildMockViewOutput,
  buildMockWebClient,
} from '@utils/slackMocks';
import { chatService } from '@/services/ChatService';

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
        reviewTypesRepo.listAll = jest
          .fn()
          .mockResolvedValueOnce(['HackerRank', 'Moby Dick Project']);

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

      it('should setup the first response block for the review type', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[0]).toEqual({
          block_id: ActionId.REVIEW_TYPE,
          type: 'input',
          label: {
            text: 'What type of submission needs reviewed?',
            type: 'plain_text',
          },
          element: {
            type: 'static_select',
            action_id: ActionId.REVIEW_TYPE,
            options: [
              { text: { text: 'HackerRank', type: 'plain_text' }, value: 'HackerRank' },
              {
                text: { text: 'Moby Dick Project', type: 'plain_text' },
                value: 'Moby Dick Project',
              },
            ],
          },
        });
      });

      it('should setup the second response block for the languages used', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[1]).toEqual({
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

      it('should setup the third response block for when the reviews are needed by', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[2]).toEqual({
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

      it('should setup the forth response block for the number of reviewers necessary', () => {
        const { mock } = param.client.views.open as jest.Mock;
        const blocks = mock.calls[0][0].view.blocks;
        expect(blocks[3]).toEqual({
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
        expect(blocks[3].element.initial_value).toEqual('2');
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
        reviewTypesRepo.listAll = jest.fn().mockResolvedValueOnce([]);

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
    let param: CallbackParam;
    const interviewingChannelId = 'some-channel-id';
    const threadId = 'some-thread-id';
    const reviewer = {
      id: 'user-id',
      languages: ['Go', 'Javascript', 'SkiffScript'],
      lastReviewedDate: undefined,
    };
    const selectedLanguages: ViewStateSelectedOption[] = [
      {
        value: 'Go',
        text: { type: 'plain_text', text: 'Go' },
      },
      {
        value: 'Javascript',
        text: { type: 'plain_text', text: 'Javascript' },
      },
    ];
    const selectedLanguagesValues = ['Go', 'Javascript'];
    const numberOfReviewers = '1';
    const deadline = Deadline.MONDAY;
    const candidateIdentifier = 'some-identifier';
    const reviewType = 'Moby Dick Project';

    beforeEach(async () => {
      process.env.INTERVIEWING_CHANNEL_ID = interviewingChannelId;

      param = buildMockCallbackParam({
        body: {
          user: {
            id: 'submitter-user-id',
          },
          view: buildMockViewOutput({
            state: {
              values: {
                [ActionId.LANGUAGE_SELECTIONS]: {
                  [ActionId.LANGUAGE_SELECTIONS]: {
                    type: 'checkboxes',
                    selected_options: selectedLanguages,
                  },
                },
                [ActionId.REVIEW_DEADLINE]: {
                  [ActionId.REVIEW_DEADLINE]: {
                    type: 'static_select',
                    selected_option: {
                      text: { type: 'plain_text', text: 'Monday' },
                      value: deadline,
                    },
                  },
                },
                [ActionId.REVIEW_TYPE]: {
                  [ActionId.REVIEW_TYPE]: {
                    type: 'static_select',
                    selected_option: {
                      text: { type: 'plain_text', text: reviewType },
                      value: reviewType,
                    },
                  },
                },
                [ActionId.NUMBER_OF_REVIEWERS]: {
                  [ActionId.NUMBER_OF_REVIEWERS]: {
                    type: 'plain_text_input',
                    value: numberOfReviewers,
                  },
                },
                [ActionId.CANDIDATE_IDENTIFIER]: {
                  [ActionId.CANDIDATE_IDENTIFIER]: {
                    type: 'plain_text_input',
                    value: candidateIdentifier,
                  },
                },
              },
            },
          }),
        } as SlackViewAction,
      });
      param.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });
      param.client.chat.postMessage = jest.fn().mockResolvedValueOnce({
        ts: threadId,
      });
      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('100');
      QueueService.getInitialUsersForReview = jest.fn().mockResolvedValueOnce([reviewer]);
      activeReviewRepo.create = jest.fn();

      await requestReview.callback(param);
    });

    it("should acknowledge the request so slack knows we're handling the dialog submission", () => {
      expect(param.ack).toBeCalled();
    });

    it.skip('should post a message to the interviewing channel', async () => {
      expect(param.client.chat.postMessage).toBeCalledWith({
        channel: interviewingChannelId,
        text: `
<@${param.body.user.id}> has requested 1 reviews for a ${reviewType} done in the following languages:

 •  Go
 •  Javascript

*The review is needed by end of day Monday*

_Candidate Identifier: some-identifier_
        `.trim(),
      });
    });

    it('should get next users to review', () => {
      expect(QueueService.getInitialUsersForReview).toBeCalledWith(
        selectedLanguagesValues,
        numberOfReviewers,
      );
    });

    it('should create a new active review row', () => {
      expect(activeReviewRepo.create).toBeCalledWith({
        threadId,
        requestorId: param.body.user.id,
        languages: selectedLanguagesValues,
        requestedAt: expect.any(Date),
        dueBy: deadline,
        reviewType: reviewType,
        candidateIdentifier: candidateIdentifier,
        reviewersNeededCount: numberOfReviewers,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [
          {
            userId: reviewer.id,
            expiresAt: expect.any(Number),
            messageTimestamp: '100',
          },
        ],
      });
    });
  });
});
