import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';

export const expireRequest = moveOntoNextPerson(async (client, previousUserId) => {
  throw Error('Not implemented: notifyExpiredUser');
});

export const declineRequest = moveOntoNextPerson(async () => {
  throw Error('Not implemented: RequestService.declineRequest callback');
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
