import { formatSlot } from '../text';

describe('formatSlot', () => {
  it('formats a slot with whole-hour times', () => {
    expect(formatSlot('2026-04-06', '16:00', '20:00')).toBe('Mon, Apr 6, 4 PM–8 PM');
  });

  it('formats a slot with minute-precision times', () => {
    expect(formatSlot('2026-04-06', '09:30', '11:00')).toBe('Mon, Apr 6, 9:30 AM–11 AM');
  });

  it('formats noon and midnight boundaries correctly', () => {
    expect(formatSlot('2026-04-07', '12:00', '13:00')).toBe('Tue, Apr 7, 12 PM–1 PM');
  });

  it('formats 8 AM start time correctly', () => {
    expect(formatSlot('2026-04-10', '08:00', '20:00')).toBe('Fri, Apr 10, 8 AM–8 PM');
  });

  it('includes the correct day of week', () => {
    expect(formatSlot('2026-03-31', '13:00', '15:00')).toBe('Tue, Mar 31, 1 PM–3 PM');
  });
});
