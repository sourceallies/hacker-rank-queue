import { pairingRequestBuilder } from '../PairingRequestBuilder';
import { InterviewFormat } from '@bot/enums';
import { AvailabilityWindow, PairingSession } from '@models/PairingSession';
import { slotsFromWindows } from '../pairingSlots';

const WINDOWS: AvailabilityWindow[] = [
  { date: '2026-03-31', startTime: '13:00', endTime: '17:00' },
  { date: '2026-04-01', startTime: '08:00', endTime: '12:00' },
];

function makeSession(availabilityWindows: AvailabilityWindow[] = WINDOWS): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date('2026-03-30'),
    teammatesNeededCount: 2,
    availabilityWindows,
    slots: slotsFromWindows(availabilityWindows),
    pendingTeammates: [],
    declinedTeammates: [],
  };
}

function blockText(session: PairingSession, blockId: string): string {
  const block = pairingRequestBuilder
    .buildTeammateDMBlocks(session)
    .find(b => b.block_id === blockId) as any;
  return block.text.text;
}

describe('pairingRequestBuilder', () => {
  describe('sessionHeader', () => {
    it('should render the candidate, languages, and format', () => {
      const header = pairingRequestBuilder.sessionHeader(makeSession());

      expect(header).toContain('Candidate: Dana');
      expect(header).toContain('Languages: Python');
      expect(header).toContain('Format: Remote');
    });
  });

  describe('buildTeammateDMBlocks', () => {
    it('should include a context block with candidate info', () => {
      const text = blockText(makeSession(), 'pairing-dm-context');

      expect(text).toContain('Dana');
      expect(text).toContain('Python');
    });

    it('should show the windows the recruiter entered rather than listing every session', () => {
      const text = blockText(makeSession(), 'pairing-dm-slots');

      expect(text).toContain('Tue, Mar 31, 1 PM–5 PM');
      expect(text).toContain('Wed, Apr 1, 8 AM–12 PM');
    });

    it('should tell the teammate how long a session runs', () => {
      expect(blockText(makeSession(), 'pairing-dm-slots')).toContain('*3 hours*');
    });

    it('should keep two windows on the same day separate rather than spanning the gap', () => {
      const text = blockText(
        makeSession([
          { date: '2026-03-31', startTime: '08:00', endTime: '11:00' },
          { date: '2026-03-31', startTime: '14:00', endTime: '17:00' },
        ]),
        'pairing-dm-slots',
      );

      expect(text).toContain('Tue, Mar 31, 8 AM–11 AM');
      expect(text).toContain('Tue, Mar 31, 2 PM–5 PM');
      // The candidate is busy 11-2; claiming an 8-5 span would be a lie.
      expect(text).not.toContain('8 AM–5 PM');
    });

    it('should not carry a checkbox list — times are picked in the modal now', () => {
      const block = pairingRequestBuilder
        .buildTeammateDMBlocks(makeSession())
        .find(b => b.block_id === 'pairing-dm-slots') as any;

      expect(block.accessory).toBeUndefined();
    });

    it('should offer a picker button and a decline-all button, both carrying the threadId', () => {
      const block = pairingRequestBuilder
        .buildTeammateDMBlocks(makeSession())
        .find(b => b.block_id === 'pairing-dm-actions') as any;

      expect(block.elements.map((e: any) => e.action_id)).toEqual([
        'pairing-open-picker',
        'pairing-decline-all',
      ]);
      block.elements.forEach((e: any) => expect(e.value).toBe('thread-1'));
    });
  });

  describe('buildTeammateDM', () => {
    it('should address the DM to the teammate', () => {
      const dm = pairingRequestBuilder.buildTeammateDM('teammate-1', makeSession());

      expect(dm.channel).toBe('teammate-1');
      expect(dm.text).toContain('Dana');
      expect(dm.blocks).toHaveLength(3);
    });
  });
});
