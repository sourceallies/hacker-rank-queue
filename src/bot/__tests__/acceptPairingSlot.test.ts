import { acceptPairingSlot } from '../acceptPairingSlot';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { buildMockApp, buildMockActionParam } from '@utils/slackMocks';
import { PairingSession } from '@models/PairingSession';
import { InterviewFormat, InterviewType } from '@bot/enums';
import * as PairingRequestService from '@/services/PairingRequestService';
import * as PairingSessionCloserModule from '@/services/PairingSessionCloser';
import { App } from '@slack/bolt';
import { chatService } from '@/services/ChatService';

function makeInterview(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'r1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [{ userId: 'u1', expiresAt: 9999999999, messageTimestamp: 'ts-1' }],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('acceptPairingSlot', () => {
  let app: App;

  beforeEach(() => {
    app = buildMockApp();
    acceptPairingSlot.app = app;
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(makeInterview());
    userRepo.find = jest.fn().mockResolvedValue({
      id: 'u1',
      name: 'Alice',
      languages: ['Python'],
      lastReviewedDate: undefined,
      lastPairingReviewedDate: undefined,
      interviewTypes: [InterviewType.PAIRING],
      formats: [InterviewFormat.REMOTE],
    });
    jest
      .spyOn(PairingRequestService.pairingRequestService, 'recordSlotSelections')
      .mockResolvedValue(makeInterview());
    jest
      .spyOn(PairingSessionCloserModule.pairingSessionCloser, 'closeIfComplete')
      .mockResolvedValue(undefined);
    userRepo.markNowAsLastReviewedDate = jest.fn().mockResolvedValue(undefined);
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
  });

  describe('handleSubmitSlots', () => {
    it('should ack', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': {
              selected_options: [{ value: 'slot-1' }],
            },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
    });

    it('should call recordSlotSelections with the selected slot IDs', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': {
              selected_options: [{ value: 'slot-1' }],
            },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(PairingRequestService.pairingRequestService.recordSlotSelections).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );
    });

    it('should not mark the user as last reviewed on submit — only on confirmed close', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [{ value: 'slot-1' }] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(userRepo.markNowAsLastReviewedDate).not.toHaveBeenCalled();
    });

    it('should call closeIfComplete after recording slot selections', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [{ value: 'slot-1' }] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(PairingSessionCloserModule.pairingSessionCloser.closeIfComplete).toHaveBeenCalledWith(
        app,
        'thread-1',
      );
    });

    it('should update the DM after recording slot selections', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [{ value: 'slot-1' }] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(chatService.updateDirectMessage).toHaveBeenCalled();
    });

    it('should call declineTeammate when no slots are selected', async () => {
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'declineTeammate')
        .mockResolvedValue(makeInterview());

      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(PairingRequestService.pairingRequestService.declineTeammate).toHaveBeenCalledWith(
        app,
        expect.anything(),
        'u1',
        expect.stringContaining("didn't select"),
      );
      expect(
        PairingRequestService.pairingRequestService.recordSlotSelections,
      ).not.toHaveBeenCalled();
    });

    it('should not record slot selections if user is not pending', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeInterview({ pendingTeammates: [] }));

      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.message = { ts: 'msg-ts-1' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [{ value: 'slot-1' }] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(
        PairingRequestService.pairingRequestService.recordSlotSelections,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleDeclineAll', () => {
    it('should ack and call declineTeammate', async () => {
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'declineTeammate')
        .mockResolvedValue(makeInterview());
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-decline-all' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;

      await acceptPairingSlot.handleDeclineAll(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(PairingRequestService.pairingRequestService.declineTeammate).toHaveBeenCalled();
    });

    it('should not call declineTeammate if user is not pending', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeInterview({ pendingTeammates: [] }));
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'declineTeammate')
        .mockResolvedValue(makeInterview());

      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-decline-all' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;

      await acceptPairingSlot.handleDeclineAll(param);

      expect(PairingRequestService.pairingRequestService.declineTeammate).not.toHaveBeenCalled();
    });
  });
});
