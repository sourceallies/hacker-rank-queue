import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { ActionId, InterviewFormat, InterviewType } from '@bot/enums';
import {
  buildMockActionParam,
  buildMockCallbackParam,
  buildMockShortcutParam,
} from '@utils/slackMocks';
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
    });

    describe('when get all languages succeeds', () => {
      const expectedLanguages: string[] = Object.freeze(['Javascript', 'LOLCODE']) as string[];

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockResolvedValueOnce(expectedLanguages);
      });

      it('should open dialog with language, interview type, and format blocks', async () => {
        await joinQueue.shortcut(shortCutParam);

        const viewCall = (shortCutParam.client.views.open as jest.Mock).mock.calls[0][0];
        const blockIds = viewCall.view.blocks.map((b: { block_id: string }) => b.block_id);

        expect(blockIds).toContain('language-selections');
        expect(blockIds).toContain('interview-type-selections');
        expect(blockIds).toContain('interview-format-selection');
      });

      it('should include Leave Queue as a danger button', async () => {
        await joinQueue.shortcut(shortCutParam);

        const viewCall = (shortCutParam.client.views.open as jest.Mock).mock.calls[0][0];
        const allElements = viewCall.view.blocks
          .filter((b: { type: string }) => b.type === 'actions')
          .flatMap((b: { elements: unknown[] }) => b.elements);

        expect(allElements).toContainEqual(
          expect.objectContaining({ style: 'danger', action_id: 'leave-queue' }),
        );
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
      });
    });
  });

  describe('callback (join/update)', () => {
    let callbackParam: CallbackParam;
    const userId = 'test-user-id';
    const userName = 'Test User';
    const selectedLanguages = ['JavaScript', 'Python'];
    const selectedInterviewTypes = ['hackerrank', 'pairing'];
    const selectedFormats = ['remote'];

    beforeEach(() => {
      callbackParam = buildMockCallbackParam({
        body: {
          user: { id: userId, name: userName },
          view: {
            state: {
              values: {
                [ActionId.LANGUAGE_SELECTIONS]: {
                  [ActionId.LANGUAGE_SELECTIONS]: {
                    selected_options: selectedLanguages.map(lang => ({ value: lang })),
                  },
                },
                [ActionId.INTERVIEW_TYPE_SELECTIONS]: {
                  [ActionId.INTERVIEW_TYPE_SELECTIONS]: {
                    selected_options: selectedInterviewTypes.map(t => ({ value: t })),
                  },
                },
                [ActionId.INTERVIEW_FORMAT_SELECTION]: {
                  [ActionId.INTERVIEW_FORMAT_SELECTION]: {
                    selected_options: selectedFormats.map(f => ({ value: f })),
                  },
                },
              },
            },
          },
        } as any,
      });

      callbackParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });

      userRepo.find = jest.fn();
      userRepo.create = jest.fn();
      userRepo.update = jest.fn();
    });

    it('should call ack', async () => {
      await joinQueue.callback(callbackParam);
      expect(callbackParam.ack).toHaveBeenCalledTimes(1);
    });

    describe('when an error occurs', () => {
      beforeEach(() => {
        userRepo.find = jest.fn().mockRejectedValueOnce(new Error('db error'));
      });

      it('should send error DM', async () => {
        await joinQueue.callback(callbackParam);
        expect(callbackParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
      });
    });

    describe('when user does not exist', () => {
      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(null);
      });

      it('should create new user with languages, interview types, and formats', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.create).toHaveBeenCalledWith({
          id: userId,
          name: userName,
          languages: selectedLanguages,
          lastReviewedDate: undefined,
          interviewTypes: selectedInterviewTypes,
          formats: selectedFormats,
        });
      });
    });

    describe('when user already exists', () => {
      const existingUser = {
        id: userId,
        name: userName,
        languages: ['Java'],
        lastReviewedDate: 123456,
        interviewTypes: [InterviewType.HACKERRANK] as InterviewType[],
        formats: [InterviewFormat.REMOTE] as InterviewFormat[],
      };

      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(existingUser);
      });

      it('should update languages, interview types, and formats', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.update).toHaveBeenCalledWith({
          ...existingUser,
          languages: selectedLanguages,
          interviewTypes: selectedInterviewTypes,
          formats: selectedFormats,
        });
      });
    });
  });

  describe('handleLeaveQueue action', () => {
    it('should remove user from queue and confirm via DM', async () => {
      const userId = 'user-to-leave';
      const actionParam = buildMockActionParam();
      actionParam.body = { user: { id: userId }, actions: [{ action_id: 'leave-queue' }] } as any;
      actionParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: 'DM-123' } });
      userRepo.remove = jest.fn().mockResolvedValue({ id: userId });

      await joinQueue.handleLeaveQueue(actionParam as any);

      expect(actionParam.ack).toHaveBeenCalled();
      expect(userRepo.remove).toHaveBeenCalledWith(userId);
      expect(actionParam.client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining("You've been removed") }),
      );
    });

    it('should send error DM when remove fails', async () => {
      userRepo.remove = jest.fn().mockRejectedValueOnce(new Error('db error'));
      const userId = 'user-to-leave';
      const actionParam = buildMockActionParam();
      actionParam.body = { user: { id: userId } } as any;
      actionParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: 'DM-123' } });

      await joinQueue.handleLeaveQueue(actionParam as any);

      expect(actionParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
    });
  });
});
