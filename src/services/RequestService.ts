import { WebClient } from '@/slackTypes';

/**
 * Notify users their time is up and request the next person
 */
export async function expireRequest(
  client: WebClient,
  review: unknown,
  expiredUserId: string,
): Promise<void> {
  // Notify expired user
  await notifyExpiredUser(client, expiredUserId);

  // Update review - mark expiredUserId as requested

  // Find next user
  const nextUserId = 'some-user';

  // Notify next user
  await notifiyNextUser(client, nextUserId);

  // Update review with nextUserId as requested

  // Save review
}

async function notifyExpiredUser(client: WebClient, userId: string): Promise<void> {
  throw Error('Not implmented');
}

async function notifiyNextUser(client: WebClient, review: string): Promise<void> {
  throw Error('Not implmented');
}
