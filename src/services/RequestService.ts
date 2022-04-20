import { ActiveReview, PendingReviewer } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';
import { chatService } from '@/services/ChatService';
import { DeadlineLabel } from '@bot/enums';
import { requestBuilder } from '@utils/RequestBuilder';
import { textBlock } from '@utils/text';
import { App } from '@slack/bolt';
import { reviewCloser } from '@/services/ReviewCloser';
import log from '@utils/log';

export const expireRequest = moveOntoNextPerson(
  'The request has expired. You will keep your spot in the queue.',
);

export const declineRequest = moveOntoNextPerson('Thanks! You will keep your spot in the queue.');

/**
 * Notify the user if necessary, and request the next person in line
 */
function moveOntoNextPerson(closeMessage: string) {
  return async (app: App, activeReview: Readonly<ActiveReview>, previousUserId: string) => {
    const updatedReview: ActiveReview = {
      ...activeReview,
    };

    log.d(
      'requestService.moveOnToNextPerson',
      `Moving on to next person for ${activeReview.threadId}`,
    );

    const priorPendingReviewer = updatedReview.pendingReviewers.find(
      ({ userId }) => userId === previousUserId,
    );
    if (priorPendingReviewer) {
      updatedReview.pendingReviewers = updatedReview.pendingReviewers.filter(
        ({ userId }) => userId !== previousUserId,
      );
      updatedReview.declinedReviewers.push({
        userId: previousUserId,
        declinedAt: new Date().getTime(),
      });
      log.d(
        'requestService.moveOnToNextPerson',
        `Adding ${previousUserId} to declined reviewers for ${activeReview.threadId}`,
      );
      await activeReviewRepo.update(updatedReview);
      const contextBlock = requestBuilder.buildReviewSectionBlock(
        { id: updatedReview.requestorId },
        updatedReview.languages,
        DeadlineLabel.get(updatedReview.dueBy) || 'Unknown',
      );
      const closeMessageBlock = textBlock(closeMessage);
      await chatService.updateDirectMessage(
        app.client,
        priorPendingReviewer.userId,
        priorPendingReviewer.messageTimestamp,
        [contextBlock, closeMessageBlock],
      );
    }

    await requestNextUserReview(updatedReview, app.client);

    await reviewCloser.closeReviewIfComplete(app, updatedReview.threadId);
  };
}

async function requestNextUserReview(review: ActiveReview, _client: WebClient): Promise<void> {
  const nextUser = await QueueService.nextInLine(review);
  if (nextUser != null) {
    log.d(
      'requestService.requestNextUserReview',
      `Requesting review from ${nextUser.userId} for review ${review.threadId}`,
    );
    const messageTimestamp = await chatService.sendRequestReviewMessage(
      _client,
      nextUser.userId,
      review.threadId,
      { id: review.requestorId },
      review.languages,
      DeadlineLabel.get(review.dueBy) || '',
    );
    const pendingReviewer: PendingReviewer = {
      ...nextUser,
      messageTimestamp,
    };
    review.pendingReviewers.push(pendingReviewer);
    await activeReviewRepo.update(review);
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
  review.acceptedReviewers.push({ userId: reviewerId, acceptedAt: new Date().getTime() });
  await activeReviewRepo.update(review);
};
