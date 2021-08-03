import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';

/**
 * Notify users their time is up and request the next person
 */
export async function declineRequest(
  client: WebClient,
  activeReview: Readonly<ActiveReview>,
  declinedUserId: string,
  expiration = false,
): Promise<void> {
  const updatedReview: ActiveReview = {
    ...activeReview,
  };

  // Unassign declined user
  updatedReview.pendingReviewers = updatedReview.pendingReviewers.filter(
    ({ userId }) => userId === declinedUserId,
  );
  updatedReview.declinedOrExpiredReviewers.push(declinedUserId);

  // Assign the next user
  const nextUser = await QueueService.nextInLine(updatedReview);
  updatedReview.pendingReviewers.push(nextUser);

  // Save review & notify
  await activeReviewRepo.update(updatedReview);
  if (expiration) await notifyExpiredUser(client, declinedUserId);
  await notifyNextUser(client, nextUser.userId);
}

async function notifyExpiredUser(client: WebClient, userId: string): Promise<void> {
  throw Error('Not implemented: notifyExpiredUser');
}

async function notifyNextUser(client: WebClient, review: string): Promise<void> {
  throw Error('Not implemented: notifyNextUser');
}
