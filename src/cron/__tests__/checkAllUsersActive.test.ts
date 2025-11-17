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

  it('should send a Slack notification when users are removed', async () => {
    const app = buildMockApp();
    userRepo.listAll = jest.fn().mockResolvedValue([
      { id: 'A', name: 'Alice Smith', languages: [], lastReviewedDate: 1 },
      { id: 'B', name: 'Bob Jones', languages: [], lastReviewedDate: 2 },
      { id: 'C', name: 'Charlie Brown', languages: [], lastReviewedDate: 3 },
    ]);
    userRepo.remove = jest.fn();
    // First user active, second and third inactive
    userService.isActive = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await checkAllUsersActive(app);

    // Verify users were removed
    expect(userRepo.remove).toHaveBeenCalledTimes(2);
    expect(userRepo.remove).toHaveBeenCalledWith('B');
    expect(userRepo.remove).toHaveBeenCalledWith('C');

    // Verify Slack notification was sent
    expect(app.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: process.env.ERRORS_CHANNEL_ID,
        text: expect.stringContaining('User(s) removed from HackerRank queue'),
      }),
    );

    // Verify the message contains the removed users' names
    const callArgs = (app.client.chat.postMessage as jest.Mock).mock.calls[0][0];
    expect(callArgs.text).toContain('Bob Jones');
    expect(callArgs.text).toContain('Charlie Brown');

    // Verify the message contains the Confluence link
    expect(callArgs.text).toContain(
      'https://allies.atlassian.net/wiki/spaces/REI/pages/4852121601/HackerRank+Roles+and+Permissions#Deactivating-a-User',
    );
  });
});
