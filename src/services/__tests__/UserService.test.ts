import { userService } from '@/services/UserService';
import { buildMockWebClient } from '@utils/slackMocks';

describe('UserService', () => {
  describe('isActive', () => {
    it('should return false if the user deleted flag is true', async () => {
      const client = buildMockWebClient();
      client.users.info = jest.fn().mockResolvedValue({ user: { deleted: true } });
      const isActive = await userService.isActive(client, 'ABC123');
      expect(isActive).toBeFalsy();
    });

    it('should return true if the user deleted flag is false', async () => {
      const client = buildMockWebClient();
      client.users.info = jest.fn().mockResolvedValue({ user: { deleted: false } });
      const isActive = await userService.isActive(client, 'ABC123');
      expect(isActive).toBeTruthy();
    });

    it('should return true if the user deleted flag does not exist', async () => {
      const client = buildMockWebClient();
      client.users.info = jest.fn().mockResolvedValue({ user: {} });
      const isActive = await userService.isActive(client, 'ABC123');
      expect(isActive).toBeTruthy();
    });
  });
});
