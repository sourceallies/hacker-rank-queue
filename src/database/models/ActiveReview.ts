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
   * List of user ids that were requested and have either expired or purposefully declined the
   * request
   */
  declinedReviewers: string[];
  pendingReviewers: Array<PendingReviewer>;
}

export interface PartialPendingReviewer {
  userId: string;
  expiresAt: number;
}

export interface PendingReviewer extends PartialPendingReviewer {
  messageTimestamp: string;
}
