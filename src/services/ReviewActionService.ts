import { ActiveReview } from '@models/ActiveReview';
import { User } from '@models/User';
import {
  AcceptedReviewAction,
  CreatedReviewAction,
  DeclinedReviewAction,
  PendingReviewAction,
  ReviewAction,
} from '@/services/models/ReviewAction';

export const reviewActionService = {
  getActions(review: ActiveReview, users: User[]): ReviewAction[] {
    const createdAction = new CreatedReviewAction(review.requestedAt.getTime());
    const acceptActions = review.acceptedReviewers.map(
      r => new AcceptedReviewAction(r.acceptedAt, getUser(r.userId, users)),
    );
    const declinedActions = review.declinedReviewers.map(
      r => new DeclinedReviewAction(r.declinedAt, getUser(r.userId, users)),
    );
    const pendingActions = review.pendingReviewers.map(
      r => new PendingReviewAction(r.expiresAt, getUser(r.userId, users)),
    );
    return [createdAction, ...acceptActions, ...declinedActions, ...pendingActions].sort(
      a => a.actionTime,
    );
  },
};

function getUser(userId: string, users: User[]): User {
  const user = users.find(u => u.id == userId);
  if (!user) {
    throw new Error(`Unable to find user with id ${userId}`);
  }
  return user;
}
