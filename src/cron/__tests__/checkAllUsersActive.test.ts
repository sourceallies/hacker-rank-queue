import { buildMockApp } from '@utils/slackMocks';
import { checkAllUsersActive } from '@cron/checkAllUsersActive';
import { userRepo } from '@repos/userRepo';
import { userService } from '@/services/UserService';

describe('checkAllUsersActive', () => {
  it('should not expire any users if they are all active', async () => {
    const app = buildMockApp();
    userRepo.listAll = jest.fn().mockResolvedValue([
      { id: 'A', name: 'a', languages: [], lastReviewedDate: 1 },
      { id: 'B', name: 'b', languages: [], lastReviewedDate: 2 },
    ]);
    userRepo.remove = jest.fn();
    userService.isActive = jest.fn().mockResolvedValue(true);

    await checkAllUsersActive(app);

    expect(userRepo.remove).not.toHaveBeenCalled();
  });

  it('should expire a user that is no longer active', async () => {
    const app = buildMockApp();
    userRepo.listAll = jest.fn().mockResolvedValue([
      { id: 'A', name: 'a', languages: [], lastReviewedDate: 1 },
      { id: 'B', name: 'b', languages: [], lastReviewedDate: 2 },
    ]);
    userRepo.remove = jest.fn();
    userService.isActive = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await checkAllUsersActive(app);

    expect(userRepo.remove).toHaveBeenCalledTimes(1);
    expect(userRepo.remove).toHaveBeenCalledWith('B');
  });
});
