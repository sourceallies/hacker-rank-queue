import { Deadline } from '@bot/enums';

export interface ActiveReview {
  threadId: string;
  requestorId: string;
  languages: string[];
  requestedAt: Date;
  dueBy: Deadline;
  reviewersNeededCount: number;
  acceptedReviewers: string[];
  pendingReviewers: Array<PendingReviewer>;
}

export interface PendingReviewer {
  userId: string;
  expiresAt: number;
}
