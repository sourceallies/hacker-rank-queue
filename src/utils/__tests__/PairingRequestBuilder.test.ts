import { pairingRequestBuilder } from '../PairingRequestBuilder';
import { InterviewFormat } from '@bot/enums';
import { AvailabilityWindow } from '@models/PairingSession';

const windows: AvailabilityWindow[] = [
  { date: '2026-03-31', startTime: '13:00', endTime: '17:00' },
  { date: '2026-04-01', startTime: '08:00', endTime: '12:00' },
];

function buildBlocks(availability: AvailabilityWindow[] = windows) {
  return pairingRequestBuilder.buildTeammateDMBlocks(
    { id: 'recruiter-1' },
    'Dana',
    ['Python'],
    InterviewFormat.REMOTE,
    availability,
    'thread-1',
  );
}

describe('pairingRequestBuilder', () => {
  describe('buildTeammateDMBlocks', () => {
    it('should include a context block with candidate info', () => {
      const contextBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-context') as any;

      expect(contextBlock).toBeDefined();
      expect(contextBlock.text.text).toContain('Dana');
      expect(contextBlock.text.text).toContain('Python');
    });

    it('should show the windows the recruiter entered rather than listing every session', () => {
      const slotsBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-slots') as any;

      expect(slotsBlock.text.text).toContain('Tue, Mar 31, 1 PM–5 PM');
      expect(slotsBlock.text.text).toContain('Wed, Apr 1, 8 AM–12 PM');
    });

    it('should keep two windows on the same day separate rather than spanning the gap', () => {
      const slotsBlock = buildBlocks([
        { date: '2026-03-31', startTime: '08:00', endTime: '11:00' },
        { date: '2026-03-31', startTime: '14:00', endTime: '17:00' },
      ]).find(b => b.block_id === 'pairing-dm-slots') as any;

      expect(slotsBlock.text.text).toContain('Tue, Mar 31, 8 AM–11 AM');
      expect(slotsBlock.text.text).toContain('Tue, Mar 31, 2 PM–5 PM');
      // The candidate is busy 11-2; claiming an 8-5 span would be a lie.
      expect(slotsBlock.text.text).not.toContain('8 AM–5 PM');
    });

    it('should tell the teammate how long a session runs', () => {
      const slotsBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-slots') as any;

      expect(slotsBlock.text.text).toContain('*3 hours*');
    });

    it('should not carry a checkbox list — times are picked in the modal now', () => {
      const slotsBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-slots') as any;

      expect(slotsBlock.accessory).toBeUndefined();
    });

    it('should offer a picker button and a decline-all button', () => {
      const actionsBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-actions') as any;

      const actionIds = actionsBlock.elements.map((e: any) => e.action_id);
      expect(actionIds).toEqual(['pairing-open-picker', 'pairing-decline-all']);
    });

    it('should set button values to the threadId', () => {
      const actionsBlock = buildBlocks().find(b => b.block_id === 'pairing-dm-actions') as any;

      actionsBlock.elements.forEach((e: any) => expect(e.value).toBe('thread-1'));
    });
  });

  describe('buildTeammateDM', () => {
    it('should address the DM to the teammate', () => {
      const dm = pairingRequestBuilder.buildTeammateDM(
        'teammate-1',
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        windows,
        'thread-1',
      );

      expect(dm.channel).toBe('teammate-1');
      expect(dm.text).toContain('Dana');
      expect(dm.blocks).toHaveLength(3);
    });
  });
});
