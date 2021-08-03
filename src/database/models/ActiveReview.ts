import { Deadline } from '@bot/enums';

export interface ActiveReview {
  threadId: string;
  requestorId: string;
  languages: string[];
  requestedAt: Date;
  dueBy: Deadline;
  /**
   * The number of reviewers requested for this review. It should not change over the life of the
   * review
   */
  reviewersNeededCount: number;
  acceptedReviewers: string[];
  /**
   * List of user ids that were requested and have either expired or declined the request
   */
  declinedOrExpiredReviewers: string[];
  pendingReviewers: Array<PendingReviewer>;
}

export interface PendingReviewer {
  userId: string;
  expiresAt: number;
}
