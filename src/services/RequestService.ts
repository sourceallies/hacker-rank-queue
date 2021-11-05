import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';
import { BOT_ICON_URL, BOT_USERNAME } from '@bot/constants';

export const expireRequest = moveOntoNextPerson(async (client, previousUserId) => {
  await client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    username: BOT_USERNAME,
    icon_url: BOT_ICON_URL,
    channel: previousUserId,
    text: 'The request has expired. You will keep your spot in the queue',
  });
});

export const declineRequest = moveOntoNextPerson(async (client, previousUserId) => {
  await client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    username: BOT_USERNAME,
    icon_url: BOT_ICON_URL,
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

    // Move from pending to declined
    updatedReview.pendingReviewers = updatedReview.pendingReviewers.filter(
      ({ userId }) => userId !== previousUserId,
    );
    updatedReview.declinedReviewers.push(previousUserId);
    await activeReviewRepo.update(updatedReview);
    await afterUserRemovedCallback(client, previousUserId);

    await requestNextUserReview(updatedReview, client);
  };
}

async function requestNextUserReview(review: ActiveReview, _client: WebClient): Promise<void> {
  const nextUser = await QueueService.nextInLine(review);
  if (nextUser != null) {
    review.pendingReviewers.push(nextUser);
    await activeReviewRepo.update(review);
    throw Error('Not implemented: notify next user');
  }
}

/**
 * Adds the provided `reviewerId` to the list of `acceptedReviewers` for the
 * review with the provided `threadId`.
 * Verifies the user is in the `pendingReviewers` list prior to adding them.
 */
export const addUserToAcceptedReviewers = async (
  reviewerId: string,
  threadId: string,
): Promise<void> => {
  const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);
  const isPendingReviewer = review.pendingReviewers.some(({ userId }) => userId == reviewerId);

  if (!isPendingReviewer) {
    throw new Error(
      `${reviewerId} attempted to accept reviewing ${threadId} but was not on the list of pending users`,
    );
  }

  review.pendingReviewers = review.pendingReviewers.filter(({ userId }) => userId !== reviewerId);
  review.acceptedReviewers.push(reviewerId);
  await activeReviewRepo.update(review);
};
