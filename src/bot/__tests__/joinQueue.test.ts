import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { ActionId } from '@bot/enums';
import { buildMockCallbackParam, buildMockShortcutParam } from '@utils/slackMocks';
import { bold, codeBlock, compose } from '@utils/text';
import { joinQueue } from '../joinQueue';

const DIRECT_MESSAGE_ID = '1234';

describe('joinQueue', () => {
  describe('shortcut', () => {
    let shortCutParam: ShortcutParam;

    beforeEach(() => {
      shortCutParam = buildMockShortcutParam();
      languageRepo.listAll = jest.fn();
      shortCutParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });
    });

    it('should call ack', async () => {
      await joinQueue.shortcut(shortCutParam);

      expect(shortCutParam.ack).toHaveBeenCalledTimes(1);
      expect(shortCutParam.ack).toHaveBeenCalledWith();
    });

    it('should get all languages', async () => {
      await joinQueue.shortcut(shortCutParam);

      expect(languageRepo.listAll).toHaveBeenCalledTimes(1);
      expect(languageRepo.listAll).toHaveBeenCalledWith();
    });

    describe('when get all languages succeeds', () => {
      const expectedLanguages: string[] = Object.freeze(['Javascript', 'LOLCODE']) as string[];

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockResolvedValueOnce(expectedLanguages);
      });

      it('should open dialog with languages populated', async () => {
        await joinQueue.shortcut(shortCutParam);

        expect(shortCutParam.client.views.open).toHaveBeenCalledTimes(1);
        expect(shortCutParam.client.views.open).toHaveBeenCalledWith({
          trigger_id: shortCutParam.shortcut.trigger_id,
          view: {
            blocks: [
              {
                block_id: 'language-selections',
                element: {
                  action_id: 'language-selections',
                  options: [
                    {
                      text: {
                        text: 'Javascript',
                        type: 'plain_text',
                      },
                      value: 'Javascript',
                    },
                    {
                      text: {
                        text: 'LOLCODE',
                        type: 'plain_text',
                      },
                      value: 'LOLCODE',
                    },
                  ],
                  type: 'checkboxes',
                },
                label: {
                  text: 'What languages would you like to review?',
                  type: 'plain_text',
                },
                type: 'input',
              },
            ],
            callback_id: 'submit-join-queue',
            submit: {
              text: 'Submit',
              type: 'plain_text',
            },
            title: {
              text: 'Join Queue',
              type: 'plain_text',
            },
            type: 'modal',
          },
        });
      });
    });

    describe('when get all languages fails', () => {
      const expectedError: Error = Object.freeze(new Error('expected error'));

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockRejectedValueOnce(expectedError);
      });

      it('should post error message', async () => {
        await joinQueue.shortcut(shortCutParam);

        expect(shortCutParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
        expect(shortCutParam.client.chat.postMessage).toHaveBeenCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: compose('Something went wrong :/', codeBlock(expectedError.message)),
        });
      });
    });
  });

  describe('callback', () => {
    let callbackParam: CallbackParam;
    const userId = 'test-user-id';
    const userName = 'Test User';
    const selectedLanguages = ['JavaScript', 'Python'];

    beforeEach(() => {
      // Set up the mock callback param with proper body structure
      callbackParam = buildMockCallbackParam({
        body: {
          user: {
            id: userId,
            name: userName,
          },
          view: {
            state: {
              values: {
                [ActionId.LANGUAGE_SELECTIONS]: {
                  [ActionId.LANGUAGE_SELECTIONS]: {
                    selected_options: selectedLanguages.map(lang => ({ value: lang })),
                  },
                },
              },
            },
          },
        } as any,
      });

      // Mock the conversations.open to return a direct message channel
      callbackParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });

      // Mock userRepo methods
      userRepo.find = jest.fn();
      userRepo.create = jest.fn();
      userRepo.update = jest.fn();
    });

    it('should call ack', async () => {
      userRepo.find = jest.fn().mockResolvedValue(null);

      await joinQueue.callback(callbackParam);

      expect(callbackParam.ack).toHaveBeenCalledTimes(1);
      expect(callbackParam.ack).toHaveBeenCalledWith();
    });

    describe('when user does not exist', () => {
      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(null);
      });

      it('should create new user with selected languages', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.find).toHaveBeenCalledWith(userId);
        expect(userRepo.create).toHaveBeenCalledWith({
          id: userId,
          name: userName,
          languages: selectedLanguages,
          lastReviewedDate: undefined,
        });
      });

      it('should send welcome message with expiration time', async () => {
        process.env.REQUEST_EXPIRATION_MIN = '15';

        await joinQueue.callback(callbackParam);

        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: compose(
            `You've been added to the queue for: ${bold(
              selectedLanguages.join(', '),
            )}. When it's your turn, we'll send you a DM just like this and you'll have 15 minutes to respond before we move to the next person.`,
            'You can opt out by using the "Leave Queue" shortcut next to the one you just used!',
          ),
        });
      });
    });

    describe('when user already exists', () => {
      const existingUser = {
        id: userId,
        name: userName,
        languages: ['Java'],
        lastReviewedDate: new Date('2023-01-01'),
      };

      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(existingUser);
      });

      it('should update existing user languages', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.find).toHaveBeenCalledWith(userId);
        expect(userRepo.update).toHaveBeenCalledWith({
          ...existingUser,
          languages: selectedLanguages,
        });
      });

      it('should send update confirmation message', async () => {
        await joinQueue.callback(callbackParam);

        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: compose(
            "You're already in the queue, so we just updated the languages you're willing to review!",
          ),
        });
      });
    });

    describe('when an error occurs', () => {
      const expectedError = new Error('Database error');

      beforeEach(() => {
        userRepo.find = jest.fn().mockRejectedValue(expectedError);
      });

      it('should send error message to user', async () => {
        await joinQueue.callback(callbackParam);

        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledWith({
          channel: DIRECT_MESSAGE_ID,
          text: compose('Something went wrong :/', codeBlock(expectedError.message)),
        });
      });
    });
  });
});
