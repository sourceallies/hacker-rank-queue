import { JoinQueueDialog } from '@dialogs';
import { Middleware, SlackShortcut, SlackShortcutMiddlewareArgs } from '@slack/bolt';
import { compose } from '@utils/text';
import { BOT_ICON_URL, BOT_USERNAME } from '../constants';

export const JoinQueueShortcut: Middleware<SlackShortcutMiddlewareArgs<SlackShortcut>> = async ({
  ack,
  shortcut,
  client,
  logger,
}) => {
  await ack();

  // TODO: Get the languages from the google sheet instead of hard coding it
  const languages: string[] = ['Java', 'C#', 'Javascript', 'Python'];

  const result = await client.views.open({
    trigger_id: shortcut.trigger_id,
    view: JoinQueueDialog(languages),
  });

  logger.debug(result);

  // TODO: Join queue
  // userRepo.add(...)

  const text = compose(
    "You've been added the the queue! When it's your turn, we'll send you a DM just like this and you'll have XX minutes to respond before we move to the next person",
    'You can opt out by using the "Leave Queue" shortcut next to the one you just used!',
  );
  await client.chat.postMessage({
    channel: shortcut.user.id,
    text,
    username: BOT_USERNAME,
    icon_url: BOT_ICON_URL,
  });
};
