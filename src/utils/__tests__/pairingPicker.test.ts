import { InterviewFormat } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import {
  applyToggle,
  buildPickerBlocks,
  buildPickerView,
  TIME_TOGGLE_PATTERN,
  timeToggleActionId,
} from '../pairingPicker';
import { slotsFromWindows } from '../pairingSlots';

const WINDOWS = [
  { date: '2026-03-31', startTime: '13:00', endTime: '17:00' }, // 13:00, 14:00
  { date: '2026-04-01', startTime: '08:00', endTime: '12:00' }, // 08:00, 09:00
];

function makeSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date('2026-03-30'),
    teammatesNeededCount: 2,
    availabilityWindows: WINDOWS,
    slots: slotsFromWindows(WINDOWS),
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

function actionBlocks(blocks: any[]): any[] {
  return blocks.filter(b => b.type === 'actions');
}

function summaryOf(blocks: any[]): string {
  return blocks.find(b => b.block_id === 'pairing-picker-summary').text.text;
}

describe('applyToggle', () => {
  it('should select an unselected chip', () => {
    const blocks = buildPickerBlocks(makeSession(), []);

    const result = applyToggle(blocks as any, 2);

    expect(result.selected).toEqual([2]);
    expect(summaryOf(result.blocks)).toContain('Wed, Apr 1, 8 AM–11 AM');
  });

  it('should deselect a chip that was already selected', () => {
    const blocks = buildPickerBlocks(makeSession(), [1, 2]);

    const result = applyToggle(blocks as any, 2);

    expect(result.selected).toEqual([1]);
  });

  it('should keep selections in time order however they were tapped', () => {
    const blocks = buildPickerBlocks(makeSession(), [3]);

    const result = applyToggle(blocks as any, 0);

    expect(result.selected).toEqual([0, 3]);
  });

  it('should repaint from the blocks alone, without needing the session', () => {
    const blocks = buildPickerBlocks(makeSession(), []);

    const chips = actionBlocks(applyToggle(blocks as any, 1).blocks).flatMap(b => b.elements);

    expect(chips.map((c: any) => c.style)).toEqual([undefined, 'primary', undefined, undefined]);
  });

  it('should drop the primary style rather than leaving a stale one behind', () => {
    const blocks = buildPickerBlocks(makeSession(), [0]);

    const chips = actionBlocks(applyToggle(blocks as any, 0).blocks).flatMap(b => b.elements);

    expect(chips[0]).not.toHaveProperty('style');
  });
});

describe('TIME_TOGGLE_PATTERN', () => {
  it('should match a chip action id', () => {
    expect(TIME_TOGGLE_PATTERN.test(timeToggleActionId(12))).toBe(true);
  });

  it('should not match the other pairing actions', () => {
    expect(TIME_TOGGLE_PATTERN.test('pairing-decline-all')).toBe(false);
    expect(TIME_TOGGLE_PATTERN.test('pairing-open-picker')).toBe(false);
  });
});

describe('buildPickerBlocks', () => {
  it('should render one actions block per day', () => {
    const blocks = buildPickerBlocks(makeSession(), []);

    expect(actionBlocks(blocks)).toHaveLength(2);
  });

  it('should render one chip per bookable session, labelled with its start time', () => {
    const blocks = buildPickerBlocks(makeSession(), []);
    const [day1, day2] = actionBlocks(blocks);

    expect(day1.elements.map((e: any) => e.text.text)).toEqual(['1 PM', '2 PM']);
    expect(day2.elements.map((e: any) => e.text.text)).toEqual(['8 AM', '9 AM']);
  });

  it('should give each chip everything a repaint needs: its index, date, and start time', () => {
    const blocks = buildPickerBlocks(makeSession(), []);
    const values = actionBlocks(blocks).flatMap(b => b.elements.map((e: any) => e.value));

    expect(values).toEqual([
      '0|2026-03-31|13:00',
      '1|2026-03-31|14:00',
      '2|2026-04-01|08:00',
      '3|2026-04-01|09:00',
    ]);
  });

  it('should style only the selected chips as primary', () => {
    const blocks = buildPickerBlocks(makeSession(), [1, 2]);
    const chips = actionBlocks(blocks).flatMap(b => b.elements);

    expect(chips.map((c: any) => c.style)).toEqual([undefined, 'primary', 'primary', undefined]);
  });

  it('should summarize the picked sessions', () => {
    const summary = summaryOf(buildPickerBlocks(makeSession(), [0, 3]));

    expect(summary).toContain('2 picked');
    expect(summary).toContain('Tue, Mar 31, 1 PM–4 PM');
    expect(summary).toContain('Wed, Apr 1, 9 AM–12 PM');
  });

  it('should warn that submitting with nothing picked passes on the session', () => {
    expect(summaryOf(buildPickerBlocks(makeSession(), []))).toContain('passes on this session');
  });

  it('should ignore a selection index that no longer maps to a slot', () => {
    expect(() => buildPickerBlocks(makeSession(), [0, 99])).not.toThrow();
    expect(summaryOf(buildPickerBlocks(makeSession(), [0, 99]))).toContain('1 picked');
  });

  it('should stay well under Slack’s 100-block modal cap for a full week of wide windows', () => {
    const slots = slotsFromWindows(
      Array.from({ length: 7 }, (_, i) => ({
        date: `2026-04-0${i + 1}`,
        startTime: '08:00',
        endTime: '19:00',
      })),
    );

    const blocks = buildPickerBlocks(makeSession({ slots }), []);

    expect(slots).toHaveLength(63);
    expect(blocks.length).toBeLessThan(100);
    // Slack rejects an actions block holding more than 25 elements.
    actionBlocks(blocks).forEach(b => expect(b.elements.length).toBeLessThanOrEqual(25));
  });
});

describe('buildPickerView', () => {
  it('should carry the thread, dm timestamp, and selections in private_metadata', () => {
    const meta = { threadId: 'thread-1', dmTs: 'ts-1', selected: [2] };

    const view = buildPickerView(makeSession(), meta);

    expect(view.callback_id).toBe('submit-pairing-times');
    expect(JSON.parse(view.private_metadata as string)).toEqual(meta);
  });

  it('should stay inside Slack’s 3000 character private_metadata budget when everything is picked', () => {
    const slots = slotsFromWindows(
      Array.from({ length: 7 }, (_, i) => ({
        date: `2026-04-0${i + 1}`,
        startTime: '08:00',
        endTime: '19:00',
      })),
    );
    const meta = {
      threadId: '1712345678.123456',
      dmTs: '1712345679.123456',
      selected: slots.map((_, i) => i),
    };

    const view = buildPickerView(makeSession({ slots }), meta);

    expect((view.private_metadata as string).length).toBeLessThan(3000);
  });
});
