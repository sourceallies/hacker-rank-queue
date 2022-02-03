import { App } from '@slack/bolt';
import { userRepo } from '@repos/userRepo';
import { userService } from '@/services/UserService';
import log from '@utils/log';
import { chatService } from '@/services/ChatService';
import { codeBlock, compose } from '@utils/text';

/**
 * Scheduled job to verify all users on the user sheet are active.
 * Removes any users that have been deactivated.
 */
export async function checkAllUsersActive(app: App): Promise<void> {
  log.d('cron.checkAllUsersActive', 'Checking if all users are still active');

  try {
    const allUsers = await userRepo.listAll();

    let allActive = true;
    for (const user of allUsers) {
      const active = await userService.isActive(app.client, user.id);
      if (!active) {
        allActive = false;
        log.d(
          'cron.checkAllUsersActive',
          `Removing deactivated user (${user.name}) from user sheet.`,
        );
        await userRepo.remove(user.id);
      }
    }
    if (allActive) {
      log.d('cron.checkAllUsersActive', '✔ All users are still active');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    log.e('cron.checkAllUsersActive', 'Error determining if users are all active', err.message);
    await chatService.postTextMessage(
      app.client,
      process.env.ERRORS_CHANNEL_ID,
      compose('Nightly check on active users failed:', codeBlock(err.message)),
    );
  }
}
