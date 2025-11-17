import Time from '@utils/time';
import { DayOfWeek, WEEKDAY_INDICES } from '@utils/constants';

export function determineExpirationTime(date: Date): number {
  const reviewLength = Number(process.env.REQUEST_EXPIRATION_MIN) * Time.MINUTE;

  let expirationTime = date.getTime() + reviewLength;
  if (onWeekendOrOutsideWorkingHours(expirationTime)) {
    expirationTime = findStartOfNextWorkingDay(expirationTime).getTime() + reviewLength;
  }
  return expirationTime;
}

function onWeekendOrOutsideWorkingHours(time: number): boolean {
  const potentialExpiration = new Date(time);
  const day = potentialExpiration.getDay();
  const onWeekend = day === DayOfWeek.SUNDAY || day === DayOfWeek.SATURDAY;
  return (
    onWeekend ||
    isBeforeWorkingHours(potentialExpiration) ||
    isAfterWorkingHours(potentialExpiration)
  );
}

function isBeforeWorkingHours(date: Date): boolean {
  return date.getHours() <= Number(process.env.WORKDAY_START_HOUR);
}

function isAfterWorkingHours(date: Date): boolean {
  return date.getHours() >= Number(process.env.WORKDAY_END_HOUR);
}

function findStartOfNextWorkingDay(potentialExpirationTime: number): Date {
  const date = new Date(potentialExpirationTime);
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
