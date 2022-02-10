import { User } from '@models/User';
import { PositionInformation } from '@/services/models/PositionInformation';
import { sortAndFilterUsers } from '@/services/QueueService';

function getPositionInformation(userId: string, allUsers: User[]): PositionInformation | undefined {
  const user = allUsers.find(u => u.id == userId);
  let positionInformation;
  if (user) {
    const languagePositions = user.languages.map(language => {
      const usersForLanguage = sortAndFilterUsers(allUsers, [language]);
      return {
        position: usersForLanguage.findIndex(u => u.id == userId) + 1,
        totalUsers: usersForLanguage.length,
        language,
      };
    });
    positionInformation = {
      user,
      languagePositions,
    };
  }

  return positionInformation;
}

export const positionInQueueService = {
  getPositionInformation,
};
