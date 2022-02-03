import { WebClient } from '@/slackTypes';

export const userService = {
  async isActive(client: WebClient, userId: string) {
    const response = await client.users.info({
      user: userId,
    });
    return !response.user?.deleted;
  },
};
