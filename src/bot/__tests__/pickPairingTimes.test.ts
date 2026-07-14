import { pickPairingTimes } from '../pickPairingTimes';
import { InterviewFormat } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { buildMockApp, buildMockWebClient } from '@utils/slackMocks';
import { slotsFromWindows } from '@utils/pairingSlots';
import { buildPickerBlocks, timeToggleActionId } from '@utils/pairingPicker';

const THREAD_ID = 'thread-1';
const DM_TS = 'dm-ts-1';
const USER_ID = 'teammate-1';

// 13:00, 14:00 on the 31st; 08:00, 09:00 on the 1st.
const WINDOWS = [
  { date: '2026-03-31', startTime: '13:00', endTime: '17:00' },
  { date: '2026-04-01', startTime: '08:00', endTime: '12:00' },
];

function makeSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: THREAD_ID,
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date('2026-03-30'),
    teammatesNeededCount: 2,
    availabilityWindows: WINDOWS,
    slots: slotsFromWindows(WINDOWS),
    pendingTeammates: [{ userId: USER_ID, expiresAt: Date.now() + 10000, messageTimestamp: DM_TS }],
    declinedTeammates: [],
    ...overrides,
  };
}

/** recordSlotSelections adds the user to the slots they picked, mimicking the real service. */
function recordInto(session: PairingSession, indices: number[]): PairingSession {
  return {
    ...session,
    slots: session.slots.map((slot, i) =>
      indices.includes(i)
        ? {
            ...slot,
            interestedTeammates: [
              ...slot.interestedTeammates,
              { userId: USER_ID, acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
            ],
          }
        : slot,
    ),
  };
}

function buildOpenParam(client = buildMockWebClient()) {
  return {
    client,
    ack: jest.fn(),
    body: {
      user: { id: USER_ID },
      actions: [{ value: THREAD_ID }],
      message: { ts: DM_TS },
      trigger_id: 'trigger-1',
    } as any,
  };
}

function buildToggleParam(selected: number[], index: number, client = buildMockWebClient()) {
  const session = makeSession();
  return {
    client,
    ack: jest.fn(),
    body: {
      user: { id: USER_ID },
      actions: [
        {
          action_id: timeToggleActionId(index),
          value: `${index}|${session.slots[index].date}|${session.slots[index].startTime}`,
        },
      ],
      view: {
        id: 'view-1',
        hash: 'hash-1',
        private_metadata: JSON.stringify({ threadId: THREAD_ID, dmTs: DM_TS, selected }),
        blocks: buildPickerBlocks(session, selected),
      },
    } as any,
  };
}

function buildSubmitParam(selected: number[], client = buildMockWebClient()) {
  return {
    client,
    ack: jest.fn(),
    body: {
      user: { id: USER_ID },
      view: {
        private_metadata: JSON.stringify({ threadId: THREAD_ID, dmTs: DM_TS, selected }),
      },
    } as any,
  };
}

describe('pickPairingTimes', () => {
  let session: PairingSession;

  beforeEach(() => {
    pickPairingTimes.app = buildMockApp();
    session = makeSession();
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(session);
    userRepo.find = jest.fn().mockResolvedValue({ id: USER_ID, formats: [InterviewFormat.REMOTE] });
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
    // reportErrorAndContinue posts through this — a test asserting we DIDN'T report needs it spied.
    chatService.postBlocksMessage = jest.fn().mockResolvedValue({ ts: 'err-ts' });
    chatService.postInThread = jest.fn().mockResolvedValue(undefined);
    pairingRequestService.recordSlotSelections = jest.fn().mockImplementation(async s => s);
    pairingRequestService.declineTeammate = jest.fn().mockResolvedValue(session);
    pairingRequestService.requestNextTeammate = jest.fn().mockResolvedValue(undefined);
    pairingSessionCloser.closeIfComplete = jest.fn().mockResolvedValue(false);
  });

  describe('openPicker', () => {
    it('should open the picker with no times selected', async () => {
      const { client, ...param } = buildOpenParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      const call = (client.views.open as jest.Mock).mock.calls[0][0];
      expect(call.trigger_id).toBe('trigger-1');
      expect(JSON.parse(call.view.private_metadata)).toEqual({
        threadId: THREAD_ID,
        dmTs: DM_TS,
        selected: [],
      });
    });

    it('should not open the picker when the session was already filled', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeSession({ pendingTeammates: [] }));
      const { client, ...param } = buildOpenParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(client.views.open).not.toHaveBeenCalled();
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        client,
        USER_ID,
        DM_TS,
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              text: expect.stringContaining('filled by someone else'),
            }),
          }),
        ]),
      );
    });
  });

  describe('toggleTime', () => {
    it('should select an unselected time and repaint against the current view hash', async () => {
      const { client, ...param } = buildToggleParam([], 2);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      const call = (client.views.update as jest.Mock).mock.calls[0][0];
      expect(call.view_id).toBe('view-1');
      expect(call.hash).toBe('hash-1');
      expect(JSON.parse(call.view.private_metadata).selected).toEqual([2]);
    });

    it('should deselect a time that was already picked', async () => {
      const { client, ...param } = buildToggleParam([1, 2], 2);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      const call = (client.views.update as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(call.view.private_metadata).selected).toEqual([1]);
    });

    it('should not re-read the session — a sheet fetch per tap would burn the read quota', async () => {
      const { client, ...param } = buildToggleParam([], 1);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      expect(pairingSessionsRepo.getByThreadIdOrUndefined).not.toHaveBeenCalled();
    });

    it('should drop a repaint superseded by a newer view instead of reporting an error', async () => {
      const conflicted = buildMockWebClient();
      conflicted.views.update = jest.fn().mockRejectedValue({ data: { error: 'hash_conflict' } });
      const { client, ...param } = buildToggleParam([], 1, conflicted);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      expect(chatService.postBlocksMessage).not.toHaveBeenCalled();
    });
  });

  describe('submitTimes', () => {
    it('should record the picked slots and ask the next teammate when not yet complete', async () => {
      const { client, ...param } = buildSubmitParam([0, 3]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(pairingRequestService.recordSlotSelections).toHaveBeenCalledWith(
        session,
        USER_ID,
        [session.slots[0].id, session.slots[3].id],
        [InterviewFormat.REMOTE],
      );
      expect(pairingRequestService.requestNextTeammate).toHaveBeenCalledTimes(1);
    });

    it('should not ask the next teammate once the session closes', async () => {
      pairingSessionCloser.closeIfComplete = jest.fn().mockResolvedValue(true);
      const { client, ...param } = buildSubmitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.requestNextTeammate).not.toHaveBeenCalled();
    });

    it('should confirm the picked times back to the teammate', async () => {
      pairingRequestService.recordSlotSelections = jest
        .fn()
        .mockResolvedValue(recordInto(session, [0]));
      const { client, ...param } = buildSubmitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      const blocks = (chatService.updateDirectMessage as jest.Mock).mock.calls[0][3];
      expect(blocks[0].text.text).toContain('Tue, Mar 31, 1 PM–4 PM');
      expect(blocks[0].text.text).toContain('Dana');
    });

    it('should confirm only the times actually recorded, not the ones that were already full', async () => {
      // The teammate picked slots 0 and 1, but slot 1 was already full, so only 0 landed.
      pairingRequestService.recordSlotSelections = jest
        .fn()
        .mockResolvedValue(recordInto(session, [0]));
      const { client, ...param } = buildSubmitParam([0, 1]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      const text = (chatService.updateDirectMessage as jest.Mock).mock.calls[0][3][0].text.text;
      expect(text).toContain('Tue, Mar 31, 1 PM–4 PM');
      expect(text).not.toContain('2 PM–5 PM');
    });

    it('should tell the teammate when every time they picked was already covered', async () => {
      pairingRequestService.recordSlotSelections = jest.fn().mockResolvedValue(session);
      const { client, ...param } = buildSubmitParam([0, 1]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      const text = (chatService.updateDirectMessage as jest.Mock).mock.calls[0][3][0].text.text;
      expect(text).toContain('already covered');
      expect(text).not.toContain('Your available times');
    });

    it('should decline when the teammate submits without picking anything', async () => {
      const { client, ...param } = buildSubmitParam([]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.declineTeammate).toHaveBeenCalledWith(
        pickPairingTimes.app,
        session,
        USER_ID,
        expect.stringContaining("didn't pick any times"),
      );
      expect(pairingRequestService.recordSlotSelections).not.toHaveBeenCalled();
    });

    it('should tell the teammate when the session filled while the picker was open', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeSession({ pendingTeammates: [] }));
      const { client, ...param } = buildSubmitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.recordSlotSelections).not.toHaveBeenCalled();
      const blocks = (chatService.updateDirectMessage as jest.Mock).mock.calls[0][3];
      expect(blocks[0].text.text).toContain('filled by someone else');
    });
  });

  describe('declineAll', () => {
    it('should decline the teammate', async () => {
      const { client, ...param } = buildOpenParam();

      await pickPairingTimes.declineAll({ client, ...param } as any);

      expect(pairingRequestService.declineTeammate).toHaveBeenCalledWith(
        pickPairingTimes.app,
        session,
        USER_ID,
        expect.stringContaining("You're all set"),
      );
    });

    it('should ignore a teammate who already responded', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeSession({ pendingTeammates: [] }));
      const { client, ...param } = buildOpenParam();

      await pickPairingTimes.declineAll({ client, ...param } as any);

      expect(pairingRequestService.declineTeammate).not.toHaveBeenCalled();
    });
  });
});
