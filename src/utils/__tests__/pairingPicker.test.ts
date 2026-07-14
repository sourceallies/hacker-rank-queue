import { InterviewFormat } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import {
  buildPickerBlocks,
  chipIndexFrom,
  parseMeta,
  PickerMeta,
  pickerView,
  serializeMeta,
  snapshotOf,
  timeToggleActionId,
  toggleSelection,
} from '../pairingPicker';
import { MAX_SESSIONS, slotsFromWindows } from '../pairingSlots';

const WINDOWS = [
  { date: '2026-03-31', startTime: '13:00', endTime: '17:00' }, // 13:00, 14:00
  { date: '2026-04-01', startTime: '08:00', endTime: '12:00' }, // 08:00, 09:00
];

const WIDE_WEEK = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-04-0${i + 1}`,
  startTime: '08:00',
  endTime: '19:00',
}));

function makeSession(windows = WINDOWS): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date('2026-03-30'),
    teammatesNeededCount: 2,
    availabilityWindows: windows,
    slots: slotsFromWindows(windows),
    pendingTeammates: [],
    declinedTeammates: [],
  };
}

function makeMeta(selected: number[] = [], windows = WINDOWS): PickerMeta {
  const session = makeSession(windows);
  return {
    threadId: 'thread-1',
    dmTs: 'dm-ts-1',
    candidateName: session.candidateName,
    languages: session.languages,
    format: session.format,
    slots: snapshotOf(session),
    selected,
  };
}

function actionBlocks(blocks: any[]): any[] {
  return blocks.filter(b => b.type === 'actions');
}

function summaryOf(blocks: any[]): string {
  return blocks.find(b => b.block_id === 'pairing-picker-summary').text.text;
}

describe('toggleSelection', () => {
  it('should add an unselected index', () => {
    expect(toggleSelection([0, 2], 1)).toEqual([0, 1, 2]);
  });

  it('should remove an already-selected index', () => {
    expect(toggleSelection([0, 1, 2], 1)).toEqual([0, 2]);
  });

  it('should keep selections in time order however they were tapped', () => {
    expect(toggleSelection([3], 0)).toEqual([0, 3]);
  });
});

describe('chipIndexFrom', () => {
  it('should recover the index from a chip action id', () => {
    expect(chipIndexFrom(timeToggleActionId(12))).toBe(12);
  });

  it('should not match the other pairing actions', () => {
    expect(chipIndexFrom('pairing-decline-all')).toBeUndefined();
    expect(chipIndexFrom('pairing-open-picker')).toBeUndefined();
  });
});

describe('meta serialization', () => {
  it('should round-trip', () => {
    const meta = makeMeta([1, 3]);

    expect(parseMeta(serializeMeta(meta))).toEqual(meta);
  });

  it('should survive an empty payload rather than throwing', () => {
    expect(parseMeta(undefined)).toEqual(expect.objectContaining({ slots: [], selected: [] }));
  });

  it('should stay inside Slack’s 3000 character budget with a full week and everything picked', () => {
    const meta = makeMeta([], WIDE_WEEK);
    const everything = { ...meta, selected: meta.slots.map((_, i) => i) };

    expect(meta.slots).toHaveLength(63);
    expect(serializeMeta(everything).length).toBeLessThan(3000);
  });

  it('should still fit at the MAX_SESSIONS cap the recruiter form enforces', () => {
    // If this fails, MAX_SESSIONS is too high and the picker modal will refuse to open.
    const slots = Array.from({ length: MAX_SESSIONS }, () => ({
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '11:00',
    }));
    const meta = { ...makeMeta(), slots, selected: slots.map((_, i) => i) };

    expect(serializeMeta(meta).length).toBeLessThan(3000);
  });
});

describe('buildPickerBlocks', () => {
  it('should render one actions block per day', () => {
    expect(actionBlocks(buildPickerBlocks(makeMeta()))).toHaveLength(2);
  });

  it('should render one chip per bookable session, labelled with its start time', () => {
    const [day1, day2] = actionBlocks(buildPickerBlocks(makeMeta()));

    expect(day1.elements.map((e: any) => e.text.text)).toEqual(['1 PM', '2 PM']);
    expect(day2.elements.map((e: any) => e.text.text)).toEqual(['8 AM', '9 AM']);
  });

  it('should style only the selected chips as primary', () => {
    const chips = actionBlocks(buildPickerBlocks(makeMeta([1, 2]))).flatMap(b => b.elements);

    expect(chips.map((c: any) => c.style)).toEqual([undefined, 'primary', 'primary', undefined]);
  });

  it('should summarize the picked sessions using their stored end times', () => {
    const summary = summaryOf(buildPickerBlocks(makeMeta([0, 3])));

    expect(summary).toContain('2 picked');
    expect(summary).toContain('Tue, Mar 31, 1 PM–4 PM');
    expect(summary).toContain('Wed, Apr 1, 9 AM–12 PM');
  });

  it('should warn that submitting with nothing picked passes on the session', () => {
    expect(summaryOf(buildPickerBlocks(makeMeta()))).toContain('passes on this session');
  });

  it('should ignore a selection index that no longer maps to a slot', () => {
    expect(summaryOf(buildPickerBlocks(makeMeta([0, 99])))).toContain('1 picked');
  });

  it('should stay well under Slack’s 100-block modal cap for a full week of wide windows', () => {
    const blocks = buildPickerBlocks(makeMeta([], WIDE_WEEK));

    expect(blocks.length).toBeLessThan(100);
    // Slack rejects an actions block holding more than 25 elements.
    actionBlocks(blocks).forEach(b => expect(b.elements.length).toBeLessThanOrEqual(25));
  });
});

describe('pickerView', () => {
  it('should carry the whole picker state in private_metadata', () => {
    const meta = makeMeta([2]);

    const view = pickerView(meta);

    expect(view.callback_id).toBe('submit-pairing-times');
    expect(parseMeta(view.private_metadata as string)).toEqual(meta);
  });
});
