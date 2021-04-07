import { App } from '@slack/bolt';
import { Interaction } from '../enums';
import { JoinQueueShortcut } from './JoinQueueShortcut';

export function setupShortcuts(app: App): void {
  app.shortcut(Interaction.SHORTCUT_JOIN_QUEUE, JoinQueueShortcut);
}
