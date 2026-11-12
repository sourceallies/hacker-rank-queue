import Time from '@utils/time';

/**
 * How many teammates each wave of offers goes to, from `NUMBER_OF_INITIAL_REVIEWERS`. The first
 * wave goes out when the request is made; later ones come from the wave cron.
 */
export function waveSize(): number {
  return positiveIntegerOr(process.env.NUMBER_OF_INITIAL_REVIEWERS, 5);
}

/**
 * How long after the newest offer on a request before the next wave goes out, from
 * `WAVE_INTERVAL_MIN`, in milliseconds. The cron checks every 15 minutes, so this rounds up to
 * the next check.
 */
export function waveIntervalMs(): number {
  return positiveIntegerOr(process.env.WAVE_INTERVAL_MIN, 30) * Time.MINUTE;
}

function positiveIntegerOr(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
