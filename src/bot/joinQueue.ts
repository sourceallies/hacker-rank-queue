import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
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
import { bold, codeBlock, compose } from '@utils/text';
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

    try {
      const languages = await languageRepo.listAll();

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages),
      });
    } catch (err) {
      client.chat.postMessage({
        channel: shortcut.user.id,
        text: compose('Something went wrong :/', codeBlock(err.message)),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }
  },

  async callback({ ack, client, body, logger }: CallbackParam): Promise<void> {
    await ack();

    const blockId = body.view.blocks[0].block_id;
    const languages: string[] = body.view.state.values[blockId][
      ActionId.LANGUAGE_SELECTIONS
    ].selected_options.map(({ value }: { value: string }) => value);
    const userId = body.user.id;

    try {
      let text: string;
      const existingUser = await userRepo.find(userId);
      if (existingUser == null) {
        await userRepo.create({
          id: userId,
          languages,
        });
        text = compose(
          `You've been added the the queue for: ${bold(
            languages.join(', '),
          )}. When it's your turn, we'll send you a DM just like this and you'll have XX minutes to respond before we move to the next person.`,
          'You can opt out by using the "Leave Queue" shortcut next to the one you just used!',
        );
      } else {
        existingUser.languages = languages;
        await userRepo.update(existingUser);
        text = compose(
          "You're already in the queue, so we just updated the languages you're willing to review!",
        );
      }

      await client.chat.postMessage({
        channel: userId,
        text,
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    } catch (err) {
      await client.chat.postMessage({
        channel: userId,
        text: compose('Something went wrong :/', codeBlock(err.message)),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }
  },
};
