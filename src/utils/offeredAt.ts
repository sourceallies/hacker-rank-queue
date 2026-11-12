/**
 * Rows written before offers stayed open have `expiresAt` instead of `offeredAt`. Treat those
 * offers as sent long ago, so they stay open and the next wave goes out on the next cron run.
 * Used for both review and pairing pending lists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOfferedAt<T extends { offeredAt: number }>(pending: any): T {
  const { expiresAt: _legacy, ...rest } = pending;
  return { ...rest, offeredAt: typeof pending.offeredAt === 'number' ? pending.offeredAt : 0 } as T;
}
