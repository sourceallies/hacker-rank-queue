import { ShortcutParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { Interaction } from './enums';

export const triggerCron = {
  app: (undefined as unknown) as App,
  triggerAllJobs: (undefined as unknown) as () => void,

  setup(app: App, triggerAllJobs: () => void): void {
    log.d('triggerCron.setup', 'Setting up TriggerCron command');
    this.app = app;
    this.triggerAllJobs = triggerAllJobs;
    app.shortcut(Interaction.SHORTCUT_TRIGGER_CRON, this.shortcut.bind(this));
  },

  async shortcut({ ack, shortcut }: ShortcutParam): Promise<void> {
    log.d('triggerCron.shortcut', `${shortcut.user.username} manually triggered all cron jobs`);
    await ack();
    this.triggerAllJobs();
  },
};
