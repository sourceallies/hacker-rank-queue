import { positionInQueueService } from '@/services/PositionInQueueService';

describe('PositionInQueueService', () => {
  describe('getPositionInformation', () => {
    const user1 = {
      id: 'user1',
      name: 'User 1',
      languages: ['Java', 'C#'],
      lastReviewedDate: 1,
    };
    const user2 = {
      id: 'user2',
      name: 'User 2',
      languages: ['Java', 'JavaScript'],
      lastReviewedDate: 2,
    };
    const user3 = {
      id: 'user3',
      name: 'User 3',
      languages: ['Java', 'C#', 'JavaScript'],
      lastReviewedDate: 3,
    };

    it('should return undefined if no matching user can be found', () => {
      const positionInformation = positionInQueueService.getPositionInformation('ABC', [
        user1,
        user2,
        user3,
      ]);
      expect(positionInformation).toBeUndefined();
    });

    it('should return information about the user and their position for each language', () => {
      const positionInformation = positionInQueueService.getPositionInformation(user2.id, [
        user1,
        user2,
        user3,
      ]);

      expect(positionInformation).toBeDefined();
      expect(positionInformation?.user).toBe(user2);
      const languagePositions = positionInformation?.languagePositions;
      expect(languagePositions).toHaveLength(2);
      expect(languagePositions).toContainEqual({
        position: 2,
        totalUsers: 3,
        language: 'Java',
      });
      expect(languagePositions).toContainEqual({
        position: 1,
        totalUsers: 2,
        language: 'JavaScript',
      });
    });
  });
});
