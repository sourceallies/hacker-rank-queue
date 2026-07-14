import { PairingSlot } from '@models/PairingSession';
import { groupByDate, sliceWindow, slotsFromWindows, validateWindow } from '../pairingSlots';

function times(slots: PairingSlot[]): string[] {
  return slots.map(s => `${s.startTime}-${s.endTime}`);
}

describe('validateWindow', () => {
  it('should accept a window exactly long enough for a session', () => {
    expect(validateWindow('08:00', '11:00')).toBeUndefined();
  });

  it('should accept a wide window', () => {
    expect(validateWindow('08:00', '19:00')).toBeUndefined();
  });

  it('should reject an end time before the start time', () => {
    expect(validateWindow('17:00', '08:00')).toBe('End time must be after start time.');
  });

  it('should reject an end time equal to the start time', () => {
    expect(validateWindow('08:00', '08:00')).toBe('End time must be after start time.');
  });

  it('should reject a window too short to hold a session', () => {
    expect(validateWindow('13:00', '15:00')).toBe(
      "A 3 hour session doesn't fit — this window is only 2 hours.",
    );
  });

  it('should describe a fractional window in the error', () => {
    expect(validateWindow('13:00', '14:00')).toBe(
      "A 3 hour session doesn't fit — this window is only 1 hour.",
    );
  });
});

describe('sliceWindow', () => {
  it('should slice a full business day into hourly starts', () => {
    const slots = sliceWindow('2026-03-31', '08:00', '17:00');

    expect(times(slots)).toEqual([
      '08:00-11:00',
      '09:00-12:00',
      '10:00-13:00',
      '11:00-14:00',
      '12:00-15:00',
      '13:00-16:00',
      '14:00-17:00',
    ]);
  });

  it('should not offer a start whose session would run past the window', () => {
    const slots = sliceWindow('2026-03-31', '13:00', '17:00');

    expect(times(slots)).toEqual(['13:00-16:00', '14:00-17:00']);
  });

  it('should yield exactly one session when the window is exactly one session long', () => {
    const slots = sliceWindow('2026-03-31', '16:00', '19:00');

    expect(times(slots)).toEqual(['16:00-19:00']);
  });

  it('should yield nothing for a window too short to hold a session', () => {
    expect(sliceWindow('2026-03-31', '13:00', '15:00')).toEqual([]);
  });

  it('should yield nothing for an inverted window', () => {
    expect(sliceWindow('2026-03-31', '17:00', '08:00')).toEqual([]);
  });

  it('should carry the date and give every session a unique id', () => {
    const slots = sliceWindow('2026-03-31', '08:00', '12:00');

    expect(slots.every(s => s.date === '2026-03-31')).toBe(true);
    expect(new Set(slots.map(s => s.id)).size).toBe(slots.length);
    expect(slots.every(s => s.interestedTeammates.length === 0)).toBe(true);
  });

  it('should stay within Slack’s 25-buttons-per-block cap on the widest realistic window', () => {
    expect(sliceWindow('2026-03-31', '08:00', '19:00')).toHaveLength(9);
  });

  it('should snap to the hour — the recruiter’s form promises whole-hour starts', () => {
    // Slack's timepicker accepts any minute, so 08:15 must not yield starts of 8:15, 9:15, 10:15…
    const slots = sliceWindow('2026-03-31', '08:15', '17:00');

    expect(times(slots)).toEqual([
      '09:00-12:00',
      '10:00-13:00',
      '11:00-14:00',
      '12:00-15:00',
      '13:00-16:00',
      '14:00-17:00',
    ]);
  });

  it('should not offer a start before an off-the-hour window opens', () => {
    expect(times(sliceWindow('2026-03-31', '13:30', '17:00'))).toEqual(['14:00-17:00']);
  });
});

describe('slotsFromWindows', () => {
  it('should slice every window', () => {
    const slots = slotsFromWindows([
      { date: '2026-03-31', startTime: '13:00', endTime: '17:00' },
      { date: '2026-04-01', startTime: '08:00', endTime: '12:00' },
    ]);

    expect(slots.map(s => `${s.date} ${s.startTime}`)).toEqual([
      '2026-03-31 13:00',
      '2026-03-31 14:00',
      '2026-04-01 08:00',
      '2026-04-01 09:00',
    ]);
  });

  it('should not emit two slots for the same time when windows overlap on a day', () => {
    const slots = slotsFromWindows([
      { date: '2026-03-31', startTime: '08:00', endTime: '13:00' },
      { date: '2026-03-31', startTime: '09:00', endTime: '14:00' },
    ]);

    expect(slots.map(s => s.startTime)).toEqual(['08:00', '09:00', '10:00', '11:00']);
    expect(new Set(slots.map(s => s.id)).size).toBe(slots.length);
  });

  it('should keep two windows on the same day distinct when they do not overlap', () => {
    const slots = slotsFromWindows([
      { date: '2026-03-31', startTime: '08:00', endTime: '11:00' },
      { date: '2026-03-31', startTime: '14:00', endTime: '17:00' },
    ]);

    expect(slots.map(s => s.startTime)).toEqual(['08:00', '14:00']);
  });

  it('should sort slots chronologically however the windows were entered', () => {
    const slots = slotsFromWindows([
      { date: '2026-04-02', startTime: '08:00', endTime: '11:00' },
      { date: '2026-04-01', startTime: '13:00', endTime: '16:00' },
    ]);

    expect(slots.map(s => s.date)).toEqual(['2026-04-01', '2026-04-02']);
  });
});

describe('groupByDate', () => {
  it('should group by day in the order the days first appear', () => {
    const slots = [
      ...sliceWindow('2026-04-01', '08:00', '11:00'),
      ...sliceWindow('2026-03-31', '08:00', '12:00'),
    ];

    const grouped = groupByDate(slots);

    expect(grouped.map(([date, entries]) => [date, entries.length])).toEqual([
      ['2026-04-01', 1],
      ['2026-03-31', 2],
    ]);
  });

  it('should carry each item’s index in the flat list, since callers address slots by position', () => {
    const slots = [
      ...sliceWindow('2026-04-01', '08:00', '11:00'),
      ...sliceWindow('2026-03-31', '08:00', '12:00'),
    ];

    const grouped = groupByDate(slots);

    expect(grouped[0][1].map(e => e.index)).toEqual([0]);
    expect(grouped[1][1].map(e => e.index)).toEqual([1, 2]);
  });

  it('should return nothing for no items', () => {
    expect(groupByDate([])).toEqual([]);
  });
});
