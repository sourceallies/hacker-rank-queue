import { requestPairingSession } from '../requestPairingSession';
import {
  buildMockShortcutParam,
  buildMockCallbackParam,
  buildMockWebClient,
} from '@utils/slackMocks';
import { languageRepo } from '@repos/languageRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { ActionId, CandidateType, InterviewFormat } from '@bot/enums';
import * as PairingQueueService from '@/services/PairingQueueService';
import * as PairingRequestService from '@/services/PairingRequestService';
import { chatService } from '@/services/ChatService';

const CHANNEL_ID = 'CHANNEL-123';

describe('requestPairingSession', () => {
  beforeEach(() => {
    process.env.INTERVIEWING_CHANNEL_ID = CHANNEL_ID;
    process.env.NUMBER_OF_INITIAL_REVIEWERS = '5';
  });

  describe('shortcut', () => {
    it('should ack and open the modal with 1 initial slot', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python', 'Java']);

      await requestPairingSession.shortcut(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(param.client.views.open).toHaveBeenCalledTimes(1);
      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      expect(view.callback_id).toBe('submit-request-pairing');
      expect(JSON.parse(view.private_metadata)).toEqual({
        slotCount: 1,
        languages: ['Python', 'Java'],
      });
    });

    it('should include an "Add another slot" button in the modal', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      await requestPairingSession.shortcut(param);

      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      const allActionIds = view.blocks
        .filter((b: any) => b.type === 'actions')
        .flatMap((b: any) => b.elements.map((e: any) => e.action_id));
      expect(allActionIds).toContain('add-pairing-slot');
    });
  });

  describe('handleAddSlot', () => {
    it('should call views.update with slotCount incremented by 1', async () => {
      const client = buildMockWebClient();

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 2, languages: ['Python'] }),
            state: {
              values: {
                'candidate-name': { 'candidate-name': { value: 'Dana' } },
                'candidate-type': {
                  'candidate-type': {
                    selected_option: { value: 'full-time', text: { text: 'Full-time' } },
                  },
                },
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': {
                    selected_option: { value: 'remote', text: { text: 'Remote' } },
                  },
                },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
                'pairing-slot-2-date': { 'pairing-slot-2-date': { selected_date: null } },
                'pairing-slot-2-start': { 'pairing-slot-2-start': { selected_time: null } },
                'pairing-slot-2-end': { 'pairing-slot-2-end': { selected_time: null } },
              },
            },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingSession.handleAddSlot(actionParam as any);

      expect(actionParam.ack).toHaveBeenCalledTimes(1);
      expect(client.views.update).toHaveBeenCalledTimes(1);
      const updatedView = (client.views.update as jest.Mock).mock.calls[0][0].view;
      expect(JSON.parse(updatedView.private_metadata)).toEqual(
        expect.objectContaining({ slotCount: 3 }),
      );
    });

    it('should not exceed the 7-slot cap', async () => {
      const client = buildMockWebClient();

      const stateValues: Record<string, any> = {
        'candidate-name': { 'candidate-name': { value: 'Dana' } },
        'candidate-type': {
          'candidate-type': {
            selected_option: { value: 'full-time', text: { text: 'Full-time' } },
          },
        },
        'language-selections': { 'language-selections': { selected_options: [] } },
        'interview-format-selection': {
          'interview-format-selection': {
            selected_option: { value: 'remote', text: { text: 'Remote' } },
          },
        },
      };
      for (let i = 1; i <= 7; i++) {
        stateValues[`pairing-slot-${i}-date`] = {
          [`pairing-slot-${i}-date`]: { selected_date: null },
        };
        stateValues[`pairing-slot-${i}-start`] = {
          [`pairing-slot-${i}-start`]: { selected_time: null },
        };
        stateValues[`pairing-slot-${i}-end`] = {
          [`pairing-slot-${i}-end`]: { selected_time: null },
        };
      }

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 7, languages: ['Python'] }),
            state: { values: stateValues },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingSession.handleAddSlot(actionParam as any);

      expect(actionParam.ack).toHaveBeenCalledTimes(1);
      expect(client.views.update).not.toHaveBeenCalled();
    });

    it('should re-populate existing slot values when re-rendering', async () => {
      const client = buildMockWebClient();

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 1, languages: ['Python'] }),
            state: {
              values: {
                'candidate-name': { 'candidate-name': { value: 'Dana' } },
                'candidate-type': {
                  'candidate-type': {
                    selected_option: { value: 'full-time', text: { text: 'Full-time' } },
                  },
                },
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': {
                    selected_option: { value: 'remote', text: { text: 'Remote' } },
                  },
                },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
              },
            },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingSession.handleAddSlot(actionParam as any);

      const updatedView = (client.views.update as jest.Mock).mock.calls[0][0].view;
      const slot1DateBlock = updatedView.blocks.find(
        (b: any) => b.block_id === 'pairing-slot-1-date',
      );
      expect(slot1DateBlock?.element?.initial_date).toBe('2026-03-31');
    });
  });

  describe('callback', () => {
    it('should ack, post to channel, DM teammates, and create the interview record', async () => {
      const mockTeammate = {
        id: 'teammate-1',
        name: 'Alice',
        languages: ['Python'],
        lastReviewedDate: undefined,
        lastPairingReviewedDate: undefined,
        interviewTypes: ['pairing' as any],
        formats: ['remote' as any],
      };
      jest
        .spyOn(PairingQueueService, 'getInitialUsersForPairingSession')
        .mockResolvedValue([mockTeammate]);
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'sendTeammateDM')
        .mockResolvedValue('ts-1');
      pairingSessionsRepo.create = jest.fn().mockImplementation(async i => i);
      pairingSessionsRepo.update = jest.fn().mockResolvedValue(undefined);
      chatService.postTextMessage = jest.fn().mockResolvedValue({ ts: 'thread-ts-1' });

      const callbackParam = buildMockCallbackParam({
        body: {
          user: { id: 'recruiter-1', name: 'Recruiter' },
          view: {
            private_metadata: JSON.stringify({ slotCount: 2, languages: ['Python'] }),
            state: {
              values: {
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': { selected_option: { value: 'remote' } },
                },
                'candidate-name': { 'candidate-name': { value: 'Dana Smith' } },
                'candidate-type': { 'candidate-type': { selected_option: { value: 'full-time' } } },
                'number-of-reviewers': { 'number-of-reviewers': { value: '2' } },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
                'pairing-slot-2-date': { 'pairing-slot-2-date': { selected_date: '2026-04-01' } },
                'pairing-slot-2-start': { 'pairing-slot-2-start': { selected_time: '09:00' } },
                'pairing-slot-2-end': { 'pairing-slot-2-end': { selected_time: '11:00' } },
              },
            },
          },
        } as any,
      });

      await requestPairingSession.callback(callbackParam);

      expect(callbackParam.ack).toHaveBeenCalledTimes(1);
      expect(pairingSessionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateName: 'Dana Smith',
          languages: ['Python'],
          format: InterviewFormat.REMOTE,
          candidateType: CandidateType.FULL_TIME,
          slots: expect.arrayContaining([
            expect.objectContaining({ date: '2026-03-31', startTime: '13:00', endTime: '15:00' }),
            expect.objectContaining({ date: '2026-04-01', startTime: '09:00', endTime: '11:00' }),
          ]),
        }),
      );
    });

    it('should send an error DM when no valid slots are provided', async () => {
      chatService.sendDirectMessage = jest.fn().mockResolvedValue(undefined);
      pairingSessionsRepo.create = jest.fn();

      const callbackParam = buildMockCallbackParam({
        body: {
          user: { id: 'recruiter-1', name: 'Recruiter' },
          view: {
            private_metadata: JSON.stringify({ slotCount: 1, languages: ['Python'] }),
            state: {
              values: {
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': { selected_option: { value: 'remote' } },
                },
                'candidate-name': { 'candidate-name': { value: 'Test' } },
                'candidate-type': { 'candidate-type': { selected_option: { value: 'full-time' } } },
                'number-of-reviewers': { 'number-of-reviewers': { value: '2' } },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: null } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: null } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: null } },
              },
            },
          },
        } as any,
      });

      await requestPairingSession.callback(callbackParam);

      expect(chatService.sendDirectMessage).toHaveBeenCalled();
      expect(pairingSessionsRepo.create).not.toHaveBeenCalled();
    });

    it('should read slotCount from private_metadata to parse the right number of slots', async () => {
      jest.spyOn(PairingQueueService, 'getInitialUsersForPairingSession').mockResolvedValue([]);
      pairingSessionsRepo.create = jest.fn().mockImplementation(async i => i);
      chatService.postTextMessage = jest.fn().mockResolvedValue({ ts: 'thread-1' });

      const callbackParam = buildMockCallbackParam({
        body: {
          user: { id: 'r1', name: 'R' },
          view: {
            private_metadata: JSON.stringify({ slotCount: 1, languages: ['Python'] }),
            state: {
              values: {
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': { selected_option: { value: 'remote' } },
                },
                'candidate-name': { 'candidate-name': { value: 'Test' } },
                'candidate-type': { 'candidate-type': { selected_option: { value: 'full-time' } } },
                'number-of-reviewers': { 'number-of-reviewers': { value: '2' } },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '09:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '11:00' } },
              },
            },
          },
        } as any,
      });

      await requestPairingSession.callback(callbackParam);

      expect(pairingSessionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: expect.arrayContaining([expect.objectContaining({ date: '2026-03-31' })]),
        }),
      );
    });
  });
});
