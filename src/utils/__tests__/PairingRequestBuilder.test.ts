import { pairingRequestBuilder } from '../PairingRequestBuilder';
import { InterviewFormat, CandidateType, ActionId, BlockId } from '@bot/enums';
import { PairingSlot } from '@models/PairingSession';

function makeSlot(overrides: Partial<PairingSlot> = {}): PairingSlot {
  return {
    id: 'slot-abc',
    date: '2026-03-31',
    startTime: '13:00',
    endTime: '15:00',
    interestedTeammates: [],
    ...overrides,
  };
}

describe('pairingRequestBuilder', () => {
  describe('buildTeammateDM', () => {
    const slots = [makeSlot(), makeSlot({ id: 'slot-def', date: '2026-04-01' })];

    it('should include a context block with candidate info', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const contextBlock = result.find(b => b.block_id === 'pairing-dm-context');
      expect(contextBlock).toBeDefined();
      expect((contextBlock as any).text.text).toContain('Dana');
      expect((contextBlock as any).text.text).toContain('Python');
    });

    it('should include a checkboxes block with one option per slot', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const slotsBlock = result.find(b => b.block_id === 'pairing-dm-slots') as any;
      expect(slotsBlock).toBeDefined();
      expect(slotsBlock.accessory.type).toBe('checkboxes');
      expect(slotsBlock.accessory.options).toHaveLength(2);
      expect(slotsBlock.accessory.options[0].value).toBe('slot-abc');
      expect(slotsBlock.accessory.options[1].value).toBe('slot-def');
    });

    it('should include a submit button and a decline-all button in the actions block', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const actionsBlock = result.find(b => b.block_id === 'pairing-dm-actions') as any;
      expect(actionsBlock).toBeDefined();
      const actionIds = actionsBlock.elements.map((e: any) => e.action_id);
      expect(actionIds).toContain('pairing-submit-slots');
      expect(actionIds).toContain('pairing-decline-all');
    });

    it('should set button values to the threadId', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const actionsBlock = result.find(b => b.block_id === 'pairing-dm-actions') as any;
      actionsBlock.elements.forEach((e: any) => {
        if (e.action_id === 'pairing-submit-slots' || e.action_id === 'pairing-decline-all') {
          expect(e.value).toBe('thread-1');
        }
      });
    });
  });
});
