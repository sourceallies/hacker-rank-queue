import { ActiveReview, PendingReviewer } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { WebClient } from '@/slackTypes';
import { QueueService } from '@services';
import { chatService } from '@/services/ChatService';
import { CandidateTypeLabel, DeadlineLabel } from '@bot/enums';
import { requestBuilder } from '@utils/RequestBuilder';
import { textBlock } from '@utils/text';
import { App } from '@slack/bolt';
import { reviewCloser } from '@/services/ReviewCloser';
import log from '@utils/log';
import { activeReviews } from '@/services/ThreadRecords';
import { reportErrorAndContinue } from '@utils/reportError';

const expireMessage = 'The request has expired. You will keep your spot in the queue.';

export const expireRequest = moveOntoNextPerson(expireMessage);

export const declineRequest = moveOntoNextPerson('Thanks! You will keep your spot in the queue.');

const withdrawRequest = moveOntoNextPerson(
  "You accepted another review, so we've passed this one on to someone else.",
);

/**
 * After `userId` accepts the review on `acceptedThreadId`, take them off every other review they
 * still have an open offer on. They count as declined there, so it's never offered to them again,
 * and the next person in line is asked in their place.
 *
 * Call this after the accepted review's lock is released. Each review is locked one at a time:
 * nesting a second review's lock inside the first can deadlock when two people accept at once.
 */
export async function withdrawFromOtherReviews(
  app: App,
  userId: string,
  acceptedThreadId: string,
): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const isPendingOn = (review: ActiveReview) =>
    review.pendingReviewers.some(pending => pending.userId === userId);

  for (const review of reviews) {
    if (review.threadId === acceptedThreadId || !isPendingOn(review)) continue;
    try {
      await activeReviews.withRecord(review.threadId, async freshReview => {
        if (!isPendingOn(freshReview)) return;
        log.d(
          'requestService.withdrawFromOtherReviews',
          `Withdrawing ${userId} from ${review.threadId} after they accepted ${acceptedThreadId}`,
        );
        await withdrawRequest(app, freshReview, userId);
      });
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when withdrawing a reviewer', {
        userId,
        acceptedThreadId,
        threadId: review.threadId,
      })(err as Error);
    }
  }
}

export const closeRequest = async (
  app: App,
  activeReview: Readonly<ActiveReview>,
  previousUserId: string,
  closeMessage: string = expireMessage,
): Promise<ActiveReview> => {
  return closeRequestInternal(app, activeReview, previousUserId, closeMessage);
};

const closeRequestInternal = async (
  app: App,
  activeReview: Readonly<ActiveReview>,
  previousUserId: string,
  closeMessage: string,
): Promise<ActiveReview> => {
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
  if (!priorPendingReviewer) {
    throw new Error(
      `${previousUserId} attempted to decline review ${activeReview.threadId} but was not in pending list`,
    );
  }

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
    CandidateTypeLabel.get(updatedReview.candidateType) || 'Unknown',
  );
  const closeMessageBlock = textBlock(closeMessage);
  await chatService.updateDirectMessage(
    app.client,
    priorPendingReviewer.userId,
    priorPendingReviewer.messageTimestamp,
    [contextBlock, closeMessageBlock],
  );
  return updatedReview;
};

/**
 * Notify the user if necessary, and request the next person in line
 */
function moveOntoNextPerson(closeMessage: string) {
  return async (app: App, activeReview: Readonly<ActiveReview>, previousUserId: string) => {
    const updatedReview = await closeRequestInternal(
      app,
      activeReview,
      previousUserId,
      closeMessage,
    );

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
      CandidateTypeLabel.get(review.candidateType) || 'Unknown',
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
