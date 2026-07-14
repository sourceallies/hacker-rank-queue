import { AvailabilityWindow, PairingSlot } from '@models/PairingSession';

/** A pairing session is a fixed-length commitment, regardless of how wide the candidate's window is. */
export const PAIRING_SESSION_HOURS = 3;

/** Teammates pick a start time on the hour. */
const START_INTERVAL_MINUTES = 60;

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function toHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Returns an error message if a session can't be booked inside this window, otherwise undefined.
 */
export function validateWindow(startTime: string, endTime: string): string | undefined {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (end <= start) {
    return 'End time must be after start time.';
  }

  const windowHours = (end - start) / 60;
  if (windowHours < PAIRING_SESSION_HOURS) {
    return `A ${PAIRING_SESSION_HOURS} hour session doesn't fit — this window is only ${formatHours(windowHours)}.`;
  }

  return undefined;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} hour${rounded === 1 ? '' : 's'}`;
}

/**
 * Slices a window of candidate availability into the bookable sessions inside it.
 *
 * Only start times where the full session fits before the window closes are offered, so any slot a
 * teammate picks is bookable as-is. An 8:00–17:00 window yields starts at 8, 9, 10, 11, 12, 13, 14.
 */
export function sliceWindow(date: string, startTime: string, endTime: string): PairingSlot[] {
  if (validateWindow(startTime, endTime)) return [];

  const windowStart = toMinutes(startTime);
  const windowEnd = toMinutes(endTime);
  const sessionMinutes = PAIRING_SESSION_HOURS * 60;

  const slots: PairingSlot[] = [];
  for (
    let start = windowStart;
    start + sessionMinutes <= windowEnd;
    start += START_INTERVAL_MINUTES
  ) {
    slots.push({
      id: crypto.randomUUID(),
      date,
      startTime: toHHMM(start),
      endTime: toHHMM(start + sessionMinutes),
      interestedTeammates: [],
    });
  }
  return slots;
}

/**
 * Slices every window and drops sessions that repeat one already produced.
 *
 * Nothing stops a recruiter entering two windows for the same day, and overlapping ones would
 * otherwise yield two distinct slot ids for the same wall-clock time — which teammates see as two
 * identical chips, and which quietly splits their picks so a slot can never reach confirmation.
 */
export function slotsFromWindows(windows: AvailabilityWindow[]): PairingSlot[] {
  const seen = new Set<string>();
  const slots: PairingSlot[] = [];
  for (const window of windows) {
    for (const slot of sliceWindow(window.date, window.startTime, window.endTime)) {
      const key = `${slot.date}T${slot.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push(slot);
    }
  }
  return slots.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

/**
 * Groups anything dated by its date, preserving the order the dates first appear in and carrying
 * each item's original index — callers render per day but address slots by position in the flat list.
 */
export function groupByDate<T extends { date: string }>(
  items: T[],
): Array<[string, Array<{ item: T; index: number }>]> {
  const byDate = new Map<string, Array<{ item: T; index: number }>>();
  items.forEach((item, index) => {
    const entry = { item, index };
    const existing = byDate.get(item.date);
    if (existing) {
      existing.push(entry);
    } else {
      byDate.set(item.date, [entry]);
    }
  });
  return Array.from(byDate.entries());
}
