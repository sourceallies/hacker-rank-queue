import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';

export const expireRequest = moveOntoNextPerson(async (client, previousUserId) => {
  await client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: previousUserId,
    text: 'The request has expired. You will keep your spot in the queue',
  });
});

export const declineRequest = moveOntoNextPerson(async (client, previousUserId) => {
  await client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: previousUserId,
    text: 'Thanks! You will keep your spot in the queue',
  });
});

/**
 * Notify the user if necessary, and request the next person in line
 */
function moveOntoNextPerson(
  afterUserRemovedCallback: (client: WebClient, previousUserId: string) => Promise<void>,
) {
  return async (
    client: WebClient,
    activeReview: Readonly<ActiveReview>,
    previousUserId: string,
  ) => {
    const updatedReview: ActiveReview = {
      ...activeReview,
    };

    // Unassign declined user
    updatedReview.pendingReviewers = updatedReview.pendingReviewers.filter(
      ({ userId }) => userId === previousUserId,
    );
    updatedReview.declinedReviewers.push(previousUserId);
    await activeReviewRepo.update(updatedReview);
    await afterUserRemovedCallback(client, previousUserId);

    await requestUserReview(updatedReview, client);
  };
}

export async function requestUserReview(review: ActiveReview, _client: WebClient): Promise<void> {
  const nextUser = await QueueService.nextInLine(review);
  review.pendingReviewers.push(nextUser);

  // Save review & notify
  await activeReviewRepo.update(review);

  throw Error('Not implemented: notify next user');
}
