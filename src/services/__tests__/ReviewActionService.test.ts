import { ActiveReview } from '@models/ActiveReview';
import { Deadline } from '@bot/enums';
import { User } from '@models/User';
import { reviewActionService } from '@/services/ReviewActionService';
import {
  AcceptedReviewAction,
  CreatedReviewAction,
  DeclinedReviewAction,
  PendingReviewAction,
} from '@/services/models/ReviewAction';

describe('ReviewActionService', () => {
  describe('getActions', () => {
    it('should return all information about reviews', () => {
      const review: ActiveReview = {
        threadId: '123',
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(1577858300000),
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [{ userId: 'A', acceptedAt: 1609480800000 }],
        declinedReviewers: [{ userId: 'B', declinedAt: 1577858400000 }],
        pendingReviewers: [{ userId: 'C', expiresAt: 1641016800000, messageTimestamp: '123' }],
        hackerRankUrl: '',
      };

      const users: User[] = [
        { id: 'A', name: 'User A', lastReviewedDate: undefined, languages: [] },
        { id: 'B', name: 'User B', lastReviewedDate: undefined, languages: [] },
        { id: 'C', name: 'User C', lastReviewedDate: undefined, languages: [] },
      ];

      const actions = reviewActionService.getActions(review, users);

      expect(actions).toHaveLength(4);

      expect(actions[0]).toBeInstanceOf(CreatedReviewAction);
      expect(actions[0].actionTime).toEqual(1577858300000);

      expect(actions[1]).toBeInstanceOf(DeclinedReviewAction);
      const declineAction = actions[1] as DeclinedReviewAction;
      expect(declineAction.actionTime).toEqual(1577858400000);
      expect(declineAction.user.name).toEqual('User B');

      expect(actions[2]).toBeInstanceOf(AcceptedReviewAction);
      const acceptAction = actions[2] as AcceptedReviewAction;
      expect(acceptAction.actionTime).toEqual(1609480800000);
      expect(acceptAction.user.name).toEqual('User A');

      expect(actions[3]).toBeInstanceOf(PendingReviewAction);
      const pendingAction = actions[3] as PendingReviewAction;
      expect(pendingAction.actionTime).toEqual(1641016800000);
      expect(pendingAction.user.name).toEqual('User C');
    });
  });
});
