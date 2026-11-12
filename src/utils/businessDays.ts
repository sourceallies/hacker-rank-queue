import { WEEKDAY_INDICES } from '@utils/constants';

/**
 * How many business days an unfilled request stays open, from `REQUEST_CLOSE_BUSINESS_DAYS`.
 */
export function requestCloseBusinessDays(): number {
  const days = Number(process.env.REQUEST_CLOSE_BUSINESS_DAYS);
  return Number.isInteger(days) && days > 0 ? days : 1;
}

/**
 * When an unfilled request closes: `days` working days after `requestedAt`, at the same time of
 * day. A request made at night or on a weekend starts counting from the next workday's start, so
 * Thursday 3pm closes Friday 3pm, Friday 3pm closes Monday 3pm, and Saturday closes Tuesday 8am.
 */
export function determineCloseTime(
  requestedAt: Date,
  days: number = requestCloseBusinessDays(),
): number {
  let date = new Date(requestedAt);
  const hour = date.getHours();
  if (
    isWeekend(date) ||
    hour < Number(process.env.WORKDAY_START_HOUR) ||
    isAfterWorkingHours(date)
  ) {
    date = findStartOfNextWorkingDay(date.getTime());
  }
  for (let added = 0; added < days;) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) added++;
  }
  return date.getTime();
}

function isWeekend(date: Date): boolean {
  return !WEEKDAY_INDICES.includes(date.getDay() as (typeof WEEKDAY_INDICES)[number]);
}

function isAfterWorkingHours(date: Date): boolean {
  return date.getHours() >= Number(process.env.WORKDAY_END_HOUR);
}

function findStartOfNextWorkingDay(time: number): Date {
  const date = new Date(time);
  // If we're after hours, move on to tomorrow.
  // If we're before hours, we'll just move to later today.
  if (isAfterWorkingHours(date)) {
    date.setDate(date.getDate() + 1);
  }
  while (!WEEKDAY_INDICES.includes(date.getDay() as (typeof WEEKDAY_INDICES)[number])) {
    date.setDate(date.getDate() + 1);
  }
  date.setHours(Number(process.env.WORKDAY_START_HOUR));
  date.setMinutes(0);
  date.setSeconds(0);
  return date;
}
