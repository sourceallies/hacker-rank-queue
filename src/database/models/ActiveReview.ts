import { CandidateType, Deadline } from '@bot/enums';

export interface ActiveReview {
  threadId: string;
  requestorId: string;
  languages: string[];
  requestedAt: Date;
  dueBy: Deadline;
  candidateIdentifier: string;
  /**
   * The type of candidate (full-time or apprentice)
   */
  candidateType: CandidateType;
  /**
   * The number of reviewers requested for this review. It should not change over the life of the
   * review
   */
  reviewersNeededCount: number;
  acceptedReviewers: Array<AcceptedReviewer>;
  /**
   * List of user ids that were requested and have either expired or purposefully declined the
   * request
   */
  declinedReviewers: Array<DeclinedReviewer>;
  pendingReviewers: Array<PendingReviewer>;
  /**
   * The URL to the HackerRank report for this review
   */
  hackerRankUrl: string;
}

export interface PartialPendingReviewer {
  userId: string;
  expiresAt: number;
}

export interface PendingReviewer extends PartialPendingReviewer {
  messageTimestamp: string;
}

export interface AcceptedReviewer {
  userId: string;
  acceptedAt: number;
}

export interface DeclinedReviewer {
  userId: string;
  declinedAt: number;
}
