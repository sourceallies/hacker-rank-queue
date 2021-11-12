import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { App, Option, View } from '@slack/bolt';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose } from '@utils/text';
import { BOT_ICON_URL, BOT_USERNAME, REQUEST_WINDOW_LENGTH_HOURS } from './constants';
import { ActionId, Interaction } from './enums';

export const joinQueue = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('joinQueue.setup', 'Setting up JoinQueue command');
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
          block_id: ActionId.LANGUAGE_SELECTIONS,
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

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('joinQueue.shortcut', `Joining queue, user.id=${shortcut.user.id}`);
    await ack();

    try {
      const languages = await languageRepo.listAll();

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('joinQueue.shortcut', 'Failed to list languages or show dialog', err);
      client.chat.postMessage({
        channel: shortcut.user.id,
        text: compose('Something went wrong :/', codeBlock(err.message)),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();

    const languages = blockUtils.getLanguageFromBody(body);
    const userId = body.user.id;
    log.d('joinQueue.callback', 'Join queue dialog submitted', {
      userId,
      languages,
    });

    try {
      let text: string;
      const existingUser = await userRepo.find(userId);
      if (existingUser == null) {
        log.d('joinQueue.callback', 'Adding new user');
        await userRepo.create({
          id: userId,
          languages,
          lastReviewedDate: undefined,
          name: body.user.name,
        });
        text = compose(
          `You've been added to the queue for: ${bold(
            languages.join(', '),
          )}. When it's your turn, we'll send you a DM just like this and you'll have ${REQUEST_WINDOW_LENGTH_HOURS} hours to respond before we move to the next person.`,
          'You can opt out by using the "Leave Queue" shortcut next to the one you just used!',
        );
      } else {
        log.d('joinQueue.callback', 'Updating existing user');
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('joinQueue.callback', 'Failed to update user', err);
      await client.chat.postMessage({
        channel: userId,
        text: compose('Something went wrong :/', codeBlock(err.message)),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }
  },
};
