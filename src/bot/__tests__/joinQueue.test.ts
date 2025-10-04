import { ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { buildMockShortcutParam } from '@utils/slackMocks';
import { codeBlock, compose } from '@utils/text';
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
});
