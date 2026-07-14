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
import { parseMeta, serializeMeta, snapshotOf, timeToggleActionId } from '@utils/pairingPicker';

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

/** Mimics what the real recordSlotSelections does to the session it returns. */
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

function metaFor(selected: number[]): string {
  const session = makeSession();
  return serializeMeta({
    threadId: THREAD_ID,
    dmTs: DM_TS,
    candidateName: session.candidateName,
    languages: session.languages,
    format: session.format,
    slots: snapshotOf(session),
    selected,
  });
}

function buttonParam(client = buildMockWebClient()) {
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

function toggleParam(selected: number[], index: number, client = buildMockWebClient()) {
  return {
    client,
    ack: jest.fn(),
    body: {
      user: { id: USER_ID },
      actions: [{ action_id: timeToggleActionId(index) }],
      view: { id: 'view-1', hash: 'hash-1', private_metadata: metaFor(selected) },
    } as any,
  };
}

function submitParam(selected: number[], client = buildMockWebClient()) {
  return {
    client,
    ack: jest.fn(),
    body: {
      user: { id: USER_ID },
      view: { private_metadata: metaFor(selected) },
    } as any,
  };
}

function dmText(): string {
  return (chatService.updateDirectMessage as jest.Mock).mock.calls[0][3][0].text.text;
}

describe('pickPairingTimes', () => {
  let session: PairingSession;

  beforeEach(() => {
    pickPairingTimes.app = buildMockApp();
    session = makeSession();
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(session);
    userRepo.find = jest.fn().mockResolvedValue({ id: USER_ID, formats: [InterviewFormat.REMOTE] });
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
    // reportErrorAndContinue posts through these — a test asserting we DIDN'T report needs them spied.
    chatService.postBlocksMessage = jest.fn().mockResolvedValue({ ts: 'err-ts' });
    chatService.postInThread = jest.fn().mockResolvedValue(undefined);
    pairingRequestService.slotsWithRoomFor = jest
      .fn()
      .mockImplementation((s: PairingSession, ids: string[]) =>
        s.slots.filter(slot => ids.includes(slot.id)),
      );
    pairingRequestService.recordSlotSelections = jest
      .fn()
      .mockImplementation(async s => recordInto(s, [0]));
    pairingRequestService.declineTeammate = jest.fn().mockResolvedValue(session);
    pairingRequestService.requestNextTeammate = jest.fn().mockResolvedValue(undefined);
    pairingSessionCloser.closeIfComplete = jest.fn().mockResolvedValue(false);
  });

  describe('openPicker', () => {
    it('should open the picker with the session snapshotted and nothing selected', async () => {
      const { client, ...param } = buttonParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      const call = (client.views.open as jest.Mock).mock.calls[0][0];
      expect(call.trigger_id).toBe('trigger-1');
      const meta = parseMeta(call.view.private_metadata);
      expect(meta).toMatchObject({ threadId: THREAD_ID, dmTs: DM_TS, selected: [] });
      expect(meta.slots).toHaveLength(4);
      expect(meta.candidateName).toBe('Dana');
    });

    it('should not open the picker once the session is gone, and collapse the DM', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);
      const { client, ...param } = buttonParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(client.views.open).not.toHaveBeenCalled();
      expect(dmText()).toContain('filled by someone else');
    });

    it('should not collapse the DM when the session is merely still being set up', async () => {
      // The row is created before its DMs go out, so between the DM landing and pendingTeammates
      // being written the teammate legitimately isn't on the list yet. Rewriting their DM here would
      // destroy their buttons and claim an empty session was filled.
      pairingSessionsRepo.getByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValue(makeSession({ pendingTeammates: [] }));
      chatService.sendDirectMessage = jest.fn().mockResolvedValue(undefined);
      const { client, ...param } = buttonParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(client.views.open).not.toHaveBeenCalled();
      expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
      expect(chatService.sendDirectMessage).toHaveBeenCalledWith(
        client,
        USER_ID,
        expect.stringContaining('still being set up'),
      );
    });

    it('should collapse the DM for someone who already responded', async () => {
      const responded = makeSession({ pendingTeammates: [] });
      responded.declinedTeammates = [{ userId: USER_ID, declinedAt: 1 }];
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(responded);
      const { client, ...param } = buttonParam();

      await pickPairingTimes.openPicker({ client, ...param } as any);

      expect(dmText()).toContain('filled by someone else');
    });
  });

  describe('toggleTime', () => {
    it('should select an unselected time and repaint against the current view hash', async () => {
      const { client, ...param } = toggleParam([], 2);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      const call = (client.views.update as jest.Mock).mock.calls[0][0];
      expect(call.view_id).toBe('view-1');
      expect(call.hash).toBe('hash-1');
      expect(parseMeta(call.view.private_metadata).selected).toEqual([2]);
    });

    it('should deselect a time that was already picked', async () => {
      const { client, ...param } = toggleParam([1, 2], 2);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      const call = (client.views.update as jest.Mock).mock.calls[0][0];
      expect(parseMeta(call.view.private_metadata).selected).toEqual([1]);
    });

    it('should not read the session — a sheet fetch per tap would burn the read quota', async () => {
      const { client, ...param } = toggleParam([], 1);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      expect(pairingSessionsRepo.getByThreadIdOrUndefined).not.toHaveBeenCalled();
    });

    it('should drop a repaint superseded by a newer view instead of reporting an error', async () => {
      const conflicted = buildMockWebClient();
      conflicted.views.update = jest.fn().mockRejectedValue({ data: { error: 'hash_conflict' } });
      const { client, ...param } = toggleParam([], 1, conflicted);

      await pickPairingTimes.toggleTime({ client, ...param } as any);

      expect(chatService.postBlocksMessage).not.toHaveBeenCalled();
    });
  });

  describe('submitTimes', () => {
    it('should resolve picks by date and start time rather than by position', async () => {
      // A session whose slots came back in a different order than the picker snapshotted them.
      const reordered = makeSession({ slots: [...makeSession().slots].reverse() });
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(reordered);
      const { client, ...param } = submitParam([0]); // snapshot index 0 = Mar 31 13:00

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      const pickedIds = (pairingRequestService.recordSlotSelections as jest.Mock).mock.calls[0][2];
      const picked = reordered.slots.find(s => s.id === pickedIds[0]);
      expect(picked).toMatchObject({ date: '2026-03-31', startTime: '13:00' });
    });

    it('should record the picked slots and ask the next teammate when not yet complete', async () => {
      const { client, ...param } = submitParam([0, 3]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(param.ack).toHaveBeenCalledTimes(1);
      const [, userId, ids, formats] = (pairingRequestService.recordSlotSelections as jest.Mock)
        .mock.calls[0];
      expect(userId).toBe(USER_ID);
      expect(ids).toEqual([session.slots[0].id, session.slots[3].id]);
      expect(formats).toEqual([InterviewFormat.REMOTE]);
      expect(pairingRequestService.requestNextTeammate).toHaveBeenCalledTimes(1);
    });

    it('should not ask the next teammate once the session closes', async () => {
      pairingSessionCloser.closeIfComplete = jest.fn().mockResolvedValue(true);
      const { client, ...param } = submitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.requestNextTeammate).not.toHaveBeenCalled();
    });

    it('should confirm the picked times back to the teammate', async () => {
      const { client, ...param } = submitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(dmText()).toContain('Tue, Mar 31, 1 PM–4 PM');
      expect(dmText()).toContain('Dana');
    });

    it('should confirm only the times actually recorded, not the ones that were already full', async () => {
      // Picked 0 and 1, but slot 1 was already full, so only 0 landed.
      const { client, ...param } = submitParam([0, 1]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(dmText()).toContain('Tue, Mar 31, 1 PM–4 PM');
      expect(dmText()).not.toContain('2 PM–5 PM');
    });

    it('should DECLINE, not silently record nothing, when every picked time is already full', async () => {
      // Otherwise recordSlotSelections drops them from pendingTeammates while adding them nowhere
      // else, and nextInLineForPairing — which excludes only pending/declined/interested users —
      // hands them this same session again, forever.
      pairingRequestService.slotsWithRoomFor = jest.fn().mockReturnValue([]);
      const { client, ...param } = submitParam([0, 1]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.recordSlotSelections).not.toHaveBeenCalled();
      expect(pairingRequestService.declineTeammate).toHaveBeenCalledWith(
        pickPairingTimes.app,
        session,
        USER_ID,
        expect.stringContaining('already covered'),
      );
    });

    it('should decline when the teammate submits without picking anything', async () => {
      const { client, ...param } = submitParam([]);

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
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);
      const { client, ...param } = submitParam([0]);

      await pickPairingTimes.submitTimes({ client, ...param } as any);

      expect(pairingRequestService.recordSlotSelections).not.toHaveBeenCalled();
      expect(dmText()).toContain('filled by someone else');
    });
  });

  describe('declineAll', () => {
    it('should decline the teammate', async () => {
      const { client, ...param } = buttonParam();

      await pickPairingTimes.declineAll({ client, ...param } as any);

      expect(pairingRequestService.declineTeammate).toHaveBeenCalledWith(
        pickPairingTimes.app,
        session,
        USER_ID,
        expect.stringContaining("You're all set"),
      );
    });

    it('should ignore a teammate who already responded', async () => {
      const responded = makeSession({ pendingTeammates: [] });
      responded.declinedTeammates = [{ userId: USER_ID, declinedAt: 1 }];
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(responded);
      const { client, ...param } = buttonParam();

      await pickPairingTimes.declineAll({ client, ...param } as any);

      expect(pairingRequestService.declineTeammate).not.toHaveBeenCalled();
    });
  });
});
