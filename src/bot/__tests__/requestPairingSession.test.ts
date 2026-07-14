import { requestPairingSession } from '../requestPairingSession';
import {
  buildMockShortcutParam,
  buildMockCallbackParam,
  buildMockWebClient,
} from '@utils/slackMocks';
import { languageRepo } from '@repos/languageRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { InterviewFormat } from '@bot/enums';
import * as PairingQueueService from '@/services/PairingQueueService';
import * as PairingRequestService from '@/services/PairingRequestService';
import { chatService } from '@/services/ChatService';

const CHANNEL_ID = 'CHANNEL-123';

interface WindowInput {
  date: string | null;
  start: string | null;
  end: string | null;
}

function stateValues(windows: WindowInput[]): Record<string, any> {
  const values: Record<string, any> = {
    'candidate-name': { 'candidate-name': { value: 'Dana Smith' } },
    'language-selections': {
      'language-selections': { selected_options: [{ value: 'Python' }] },
    },
    'interview-format-selection': {
      'interview-format-selection': {
        selected_option: { value: 'remote', text: { text: 'Remote' } },
      },
    },
    'number-of-reviewers': { 'number-of-reviewers': { value: '2' } },
  };
  windows.forEach((window, i) => {
    const n = i + 1;
    values[`pairing-slot-${n}-date`] = {
      [`pairing-slot-${n}-date`]: { selected_date: window.date },
    };
    values[`pairing-slot-${n}-start`] = {
      [`pairing-slot-${n}-start`]: { selected_time: window.start },
    };
    values[`pairing-slot-${n}-end`] = {
      [`pairing-slot-${n}-end`]: { selected_time: window.end },
    };
  });
  return values;
}

function buildActionParam(windowCount: number, windows: WindowInput[]) {
  const client = buildMockWebClient();
  return {
    client,
    param: {
      ack: jest.fn(),
      body: {
        view: {
          id: 'view-id-1',
          private_metadata: JSON.stringify({ windowCount, languages: ['Python'] }),
          state: { values: stateValues(windows) },
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
    },
  };
}

function buildCallback(windowCount: number, windows: WindowInput[]) {
  return buildMockCallbackParam({
    body: {
      user: { id: 'recruiter-1', name: 'Recruiter' },
      view: {
        private_metadata: JSON.stringify({ windowCount, languages: ['Python'] }),
        state: { values: stateValues(windows) },
      },
    } as any,
  });
}

describe('requestPairingSession', () => {
  beforeEach(() => {
    process.env.INTERVIEWING_CHANNEL_ID = CHANNEL_ID;
    process.env.NUMBER_OF_INITIAL_REVIEWERS = '5';
    jest.spyOn(PairingQueueService, 'getInitialUsersForPairingSession').mockResolvedValue([]);
    jest
      .spyOn(PairingRequestService.pairingRequestService, 'sendTeammateDM')
      .mockResolvedValue('ts-1');
    pairingSessionsRepo.create = jest.fn().mockImplementation(async i => i);
    pairingSessionsRepo.update = jest.fn().mockResolvedValue(undefined);
    chatService.postTextMessage = jest.fn().mockResolvedValue({ ts: 'thread-ts-1' });
    chatService.sendDirectMessage = jest.fn().mockResolvedValue(undefined);
  });

  describe('shortcut', () => {
    it('should ack and open the modal with 1 initial window', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python', 'Java']);

      await requestPairingSession.shortcut(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      expect(view.callback_id).toBe('submit-request-pairing');
      expect(JSON.parse(view.private_metadata)).toEqual({
        windowCount: 1,
        languages: ['Python', 'Java'],
      });
    });

    it('should include an "Add another day" button in the modal', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      await requestPairingSession.shortcut(param);

      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      const actionIds = view.blocks
        .filter((b: any) => b.type === 'actions')
        .flatMap((b: any) => b.elements.map((e: any) => e.action_id));
      expect(actionIds).toContain('add-pairing-slot');
    });
  });

  describe('handleAddWindow', () => {
    it('should call views.update with the window count incremented', async () => {
      const { client, param } = buildActionParam(2, [
        { date: '2026-03-31', start: '13:00', end: '17:00' },
        { date: null, start: null, end: null },
      ]);

      await requestPairingSession.handleAddWindow(param as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      const view = (client.views.update as jest.Mock).mock.calls[0][0].view;
      expect(JSON.parse(view.private_metadata)).toEqual(
        expect.objectContaining({ windowCount: 3 }),
      );
    });

    it('should not exceed the window cap', async () => {
      const windows = Array.from({ length: 7 }, () => ({ date: null, start: null, end: null }));
      const { client, param } = buildActionParam(7, windows);

      await requestPairingSession.handleAddWindow(param as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(client.views.update).not.toHaveBeenCalled();
    });

    it('should re-populate existing window values when re-rendering', async () => {
      const { client, param } = buildActionParam(1, [
        { date: '2026-03-31', start: '13:00', end: '17:00' },
      ]);

      await requestPairingSession.handleAddWindow(param as any);

      const view = (client.views.update as jest.Mock).mock.calls[0][0].view;
      const dateBlock = view.blocks.find((b: any) => b.block_id === 'pairing-slot-1-date');
      expect(dateBlock?.element?.initial_date).toBe('2026-03-31');
    });
  });

  describe('callback', () => {
    it('should slice each window into the bookable sessions inside it', async () => {
      const param = buildCallback(2, [
        { date: '2026-03-31', start: '13:00', end: '17:00' },
        { date: '2026-04-01', start: '08:00', end: '12:00' },
      ]);

      await requestPairingSession.callback(param);

      expect(param.ack).toHaveBeenCalledWith();
      const session = (pairingSessionsRepo.create as jest.Mock).mock.calls[0][0];
      expect(session.candidateName).toBe('Dana Smith');
      expect(session.format).toBe(InterviewFormat.REMOTE);
      expect(session.slots.map((s: any) => `${s.date} ${s.startTime}-${s.endTime}`)).toEqual([
        '2026-03-31 13:00-16:00',
        '2026-03-31 14:00-17:00',
        '2026-04-01 08:00-11:00',
        '2026-04-01 09:00-12:00',
      ]);
    });

    it('should reject a window too short for a session, before acking the modal', async () => {
      const param = buildCallback(1, [{ date: '2026-03-31', start: '13:00', end: '15:00' }]);

      await requestPairingSession.callback(param);

      expect(param.ack).toHaveBeenCalledWith({
        response_action: 'errors',
        errors: {
          'pairing-slot-1-end': "A 3 hour session doesn't fit — this window is only 2 hours.",
        },
      });
      expect(pairingSessionsRepo.create).not.toHaveBeenCalled();
    });

    it('should reject an end time that is before the start time', async () => {
      const param = buildCallback(1, [{ date: '2026-03-31', start: '17:00', end: '08:00' }]);

      await requestPairingSession.callback(param);

      expect(param.ack).toHaveBeenCalledWith({
        response_action: 'errors',
        errors: { 'pairing-slot-1-end': 'End time must be after start time.' },
      });
      expect(pairingSessionsRepo.create).not.toHaveBeenCalled();
    });

    it('should report an error against the offending window when only one is bad', async () => {
      const param = buildCallback(2, [
        { date: '2026-03-31', start: '08:00', end: '17:00' },
        { date: '2026-04-01', start: '08:00', end: '09:00' },
      ]);

      await requestPairingSession.callback(param);

      const ackArg = (param.ack as jest.Mock).mock.calls[0][0];
      expect(Object.keys(ackArg.errors)).toEqual(['pairing-slot-2-end']);
      expect(pairingSessionsRepo.create).not.toHaveBeenCalled();
    });

    it('should reject an empty form rather than silently dropping the window', async () => {
      const param = buildCallback(1, [{ date: null, start: null, end: null }]);

      await requestPairingSession.callback(param);

      expect(param.ack).toHaveBeenCalledWith({
        response_action: 'errors',
        errors: { 'pairing-slot-1-end': 'Please provide at least one availability window.' },
      });
      expect(pairingSessionsRepo.create).not.toHaveBeenCalled();
    });

    it('should DM the initial teammates and record them as pending', async () => {
      jest.spyOn(PairingQueueService, 'getInitialUsersForPairingSession').mockResolvedValue([
        {
          id: 'teammate-1',
          name: 'Alice',
          languages: ['Python'],
          lastReviewedDate: undefined,
          lastPairingReviewedDate: undefined,
          interviewTypes: ['pairing' as any],
          formats: ['remote' as any],
        },
      ]);
      const param = buildCallback(1, [{ date: '2026-03-31', start: '08:00', end: '17:00' }]);

      await requestPairingSession.callback(param);

      expect(PairingRequestService.pairingRequestService.sendTeammateDM).toHaveBeenCalledTimes(1);
      expect(pairingSessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingTeammates: [expect.objectContaining({ userId: 'teammate-1' })],
        }),
      );
    });
  });
});
