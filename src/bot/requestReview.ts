import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { App, View } from '@slack/bolt';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose, mention, ul } from '@utils/text';
import { BOT_ICON_URL, BOT_USERNAME } from './constants';
import { ActionId, Deadline, Interaction } from './enums';

export const requestReview = {
  app: (undefined as unknown) as App,

  setup(app: App): void {
    log.d('requestReview.setup', 'Setting up RequestReview command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_REVIEW, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_REQUEST_REVIEW, this.callback.bind(this));
  },

  dialog(languages: string[]): View {
    return {
      title: {
        text: 'Request a Review',
        type: 'plain_text',
      },
      type: 'modal',
      callback_id: Interaction.SUBMIT_REQUEST_REVIEW,
      blocks: [
        {
          type: 'input',
          block_id: ActionId.LANGUAGE_SELECTIONS,
          label: {
            text: 'What languages were used?',
            type: 'plain_text',
          },
          element: {
            type: 'checkboxes',
            action_id: ActionId.LANGUAGE_SELECTIONS,
            options: languages.map(language => ({
              text: { text: language, type: 'plain_text' as const },
              value: language,
            })),
          },
        },
        {
          type: 'input',
          block_id: ActionId.REVIEW_DEADLINE,
          label: {
            text: 'When do you need this reviewed by?',
            type: 'plain_text',
          },
          element: {
            type: 'static_select',
            action_id: ActionId.REVIEW_DEADLINE,
            options: [
              { text: { text: 'End of day', type: 'plain_text' }, value: Deadline.END_OF_DAY },
              { text: { text: 'Tomorrow', type: 'plain_text' }, value: Deadline.TOMORROW },
              { text: { text: 'End of week', type: 'plain_text' }, value: Deadline.END_OF_WEEK },
              { text: { text: 'Monday', type: 'plain_text' }, value: Deadline.MONDAY },
              { text: { text: 'Other', type: 'plain_text' }, value: Deadline.NONE },
            ],
          },
        },
        {
          type: 'input',
          block_id: ActionId.NUMBER_OF_REVIEWERS,
          label: {
            text: 'How many reviewers are needed?',
            type: 'plain_text',
          },
          element: {
            type: 'plain_text_input',
            action_id: ActionId.NUMBER_OF_REVIEWERS,
            initial_value: '2',
            placeholder: {
              text: 'Enter a number...',
              type: 'plain_text',
            },
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
    log.d('requestReview.shortcut', `Requesting review, user.id=${shortcut.user.id}`);
    await ack();

    try {
      const languages = await languageRepo.listAll();

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages),
      });
    } catch (err) {
      const userId = shortcut.user.id;
      client.chat.postMessage({
        channel: userId,
        text: compose('Something went wrong :/', codeBlock(err.message)),
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();

    const user = body.user;
    const channel = process.env.INTERVIEWING_CHANNEL_ID;
    const languages = blockUtils.getLanguageFromBody(body);
    const deadline = blockUtils.getBlockValue(body, ActionId.REVIEW_DEADLINE);
    const numberOfReviewers = blockUtils.getBlockValue(body, ActionId.NUMBER_OF_REVIEWERS);

    const numberOfReviewersValue = numberOfReviewers.value;
    const deadlineValue = deadline.selected_option.value;
    const deadlineDisplay = deadline.selected_option.text.text;
    log.d(
      'requestReview.callback',
      'Parsed values:',
      JSON.stringify({
        numberOfReviewersValue,
        deadlineValue,
        deadlineDisplay,
        languages,
        user,
        channel,
      }),
    );

    await client.chat.postMessage({
      channel,
      text: compose(
        `${mention(
          user,
        )} has requested ${numberOfReviewersValue} reviews for a HackerRank done in the following languages:`,
        ul(...languages),
        bold(`The review is needed by: ${deadlineDisplay}`),
      ),
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
    });
  },
};
