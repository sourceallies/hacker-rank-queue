import {
  AcceptedReviewAction,
  CreatedReviewAction,
  DeclinedReviewAction,
  PendingReviewAction,
} from '@/services/models/ReviewAction';

describe('ReviewAction', () => {
  const USER_ID = '123';
  const USER_NAME = 'jdoe';
  const TIME = 1650505459547;
  const USER = {
    id: USER_ID,
    name: USER_NAME,
    languages: [],
    lastReviewedDate: undefined,
    lastPairingReviewedDate: undefined,
    interviewTypes: [] as any,
    formats: [] as any,
  };

  describe('AcceptedReviewAction', () => {
    it('should correctly render markdown', () => {
      const action = new AcceptedReviewAction(TIME, USER);

      expect(action.toMarkdown()).toEqual(`\`Wed 08:44 PM\` accepted by <@${USER_ID}>`);
    });
  });

  describe('DeclinedReviewAction', () => {
    it('should correctly render markdown', () => {
      const action = new DeclinedReviewAction(TIME, USER);

      expect(action.toMarkdown()).toEqual(`\`Wed 08:44 PM\` declined by <@${USER_ID}>`);
    });
  });

  describe('PendingReviewAction', () => {
    it('should correctly render markdown', () => {
      const action = new PendingReviewAction(TIME, USER);

      expect(action.toMarkdown()).toEqual(`\`now\` pending with <@${USER_ID}>`);
    });
  });

  describe('CreatedReviewAction', () => {
    it('should correctly render markdown', () => {
      const action = new CreatedReviewAction(TIME);

      expect(action.toMarkdown()).toEqual(`\`Wed 08:44 PM\` review requested`);
    });
  });
});
