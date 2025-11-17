/**
 * Day of week constants (0 = Sunday, 6 = Saturday)
 */
export const DayOfWeek = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

/**
 * Array of weekday indices (Monday through Friday)
 */
export const WEEKDAY_INDICES = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
] as const;

/**
 * Time constants in milliseconds
 */
export const TimeMs = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
} as const;

/**
 * Spreadsheet cache timeout in milliseconds (60 seconds)
 */
export const SPREADSHEET_CACHE_TIMEOUT_MS = 60 * TimeMs.SECOND;

/**
 * Cron schedule interval for checking expired requests during work hours (every 15 minutes)
 */
export const CRON_EXPIRE_REQUESTS_INTERVAL_MINUTES = 15;
