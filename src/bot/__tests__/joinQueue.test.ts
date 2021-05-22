import { ShortcutParam } from '@/slackTypes';
import { BOT_ICON_URL, BOT_USERNAME } from '@bot/constants';
import { languageRepo } from '@repos/languageRepo';
import { buildMockShortcutParam } from '@utils/slackMocks';
import { codeBlock, compose } from '@utils/text';
import { joinQueue } from '../joinQueue';

describe('joinQueue', () => {
  describe('shortcut', () => {
    let shortCutParam: ShortcutParam;

    beforeEach(() => {
      shortCutParam = buildMockShortcutParam();
      languageRepo.listAll = jest.fn();
    });

    it('should call ack', async () => {
      await joinQueue.shortcut(shortCutParam);

      expect(shortCutParam.ack).toBeCalledTimes(1);
      expect(shortCutParam.ack).toBeCalledWith();
    });

    it('should get all languages', async () => {
      await joinQueue.shortcut(shortCutParam);

      expect(languageRepo.listAll).toBeCalledTimes(1);
      expect(languageRepo.listAll).toBeCalledWith();
    });

    describe('when get all languages succeeds', () => {
      const expectedLanguages: string[] = Object.freeze(['Javascript', 'LOLCODE']) as string[];

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockResolvedValueOnce(expectedLanguages);
      });

      it('should open dialog with languages populated', async () => {
        await joinQueue.shortcut(shortCutParam);

        expect(shortCutParam.client.views.open).toBeCalledTimes(1);
        expect(shortCutParam.client.views.open).toBeCalledWith({
          trigger_id: shortCutParam.shortcut.trigger_id,
          view: {
            blocks: [
              {
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
              text: 'Join HackerRank Queue',
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

        expect(shortCutParam.client.chat.postMessage).toBeCalledTimes(1);
        expect(shortCutParam.client.chat.postMessage).toBeCalledWith({
          channel: shortCutParam.shortcut.user.id,
          text: compose('Something went wrong :/', codeBlock(expectedError.message)),
          username: BOT_USERNAME,
          icon_url: BOT_ICON_URL,
        });
      });
    });
  });
});
