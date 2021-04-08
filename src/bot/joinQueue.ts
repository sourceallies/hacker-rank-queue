import { compose } from '@utils/text';
import {
  App,
  Middleware,
  Option,
  SlackShortcut,
  SlackShortcutMiddlewareArgs,
  SlackViewAction,
  SlackViewMiddlewareArgs,
  View,
} from '@slack/bolt';
import { BOT_ICON_URL, BOT_USERNAME } from './constants';
import { ActionId, Interaction } from './enums';

type ShortcutParam = Parameters<Middleware<SlackShortcutMiddlewareArgs<SlackShortcut>>>[0];
type CallbackParam = Parameters<Middleware<SlackViewMiddlewareArgs<SlackViewAction>>>[0];

export const joinQueue = {
  app: (undefined as unknown) as App,

  setup(app: App): void {
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_JOIN_QUEUE, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_JOIN_QUEUE, this.callback.bind(this));
  },

  dialog(languages: string[]): View {
    return {
      title: {
        text: 'Join HackerRank Queue',
        type: 'plain_text',
      },
      type: 'modal',
      callback_id: Interaction.SUBMIT_JOIN_QUEUE,
      blocks: [
        {
          type: 'input',
          label: {
            text: `What languages would you like to review?`,
            type: 'plain_text',
          },
          element: {
            type: 'checkboxes',
            action_id: ActionId.LANGUAGE_SELECTIONS,
            options: languages.map<Option>(lang => ({
              text: { text: lang, type: 'plain_text' },
              value: lang,
            })),
          },
        },
      ],
      submit: {
        type: 'plain_text',
        text: 'Submit',
      },
    };
  },

  async shortcut({ ack, shortcut, client, logger }: ShortcutParam): Promise<void> {
    await ack();

    // TODO: Get the languages from the google sheet instead of hard coding it
    const languages: string[] = ['Java', 'C#', 'Javascript', 'Python'];

    const response = await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: this.dialog(languages),
    });

    logger.debug('Dialog response:', JSON.stringify(response, null, 2));
  },

  async callback({ ack, client, body, logger }: CallbackParam): Promise<void> {
    await ack();
    logger.info('Event body:', JSON.stringify(body, null, 2));

    // TODO: Join queue
    // userRepo.add(...)

    const text = compose(
      "You've been added the the queue! When it's your turn, we'll send you a DM just like this and you'll have XX minutes to respond before we move to the next person.",
      'You can opt out by using the "Leave Queue" shortcut next to the one you just used!',
    );
    await client.chat.postMessage({
      channel: body.user.id,
      text,
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
    });
  },
};
