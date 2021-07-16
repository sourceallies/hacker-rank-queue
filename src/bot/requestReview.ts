import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { isViewSubmitActionParam } from '@/typeGuards';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { App, View } from '@slack/bolt';
import Time from '@utils/ time';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose, ul, mention } from '@utils/text';
import { BOT_ICON_URL, BOT_USERNAME } from './constants';
import { ActionId, BlockId, Deadline, Interaction } from './enums';

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

  async callback(params: CallbackParam): Promise<void> {
    const { ack, client, body } = params;
    await ack();

    if (!isViewSubmitActionParam(params)) {
      // TODO: How should we handle this case(if we need to)?
      console.log('callback called for non-submit action');
    }

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

    const postMessageResult = await client.chat.postMessage({
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

    // @ts-expect-error Bolt types bad
    const threadId: string = postMessageResult.ts;
    console.log({ postMessageResult });

    const reviewers = await userRepo.getNextUsersToReview(languages, numberOfReviewersValue);

    if (reviewers.length < numberOfReviewersValue) {
      console.log('There are not enough reviewers available for the selected languages!');
      await client.chat.postMessage({
        channel: user.id,
        text: `There are not enough reviewers available for the selected languages(${languages.concat(
          ',',
        )})! Found ${reviewers.length} users in the queue that match those languages.`,
        username: BOT_USERNAME,
        icon_url: BOT_ICON_URL,
      });
    }

    await activeReviewRepo.create({
      threadId,
      requestorId: user.id,
      languages,
      requestedAt: new Date(),
      dueBy: deadlineValue,
      reviewersNeededCount: numberOfReviewersValue,
      acceptedReviewers: [],
      pendingReviewers: reviewers.map(user => ({
        userId: user.id,
        expiresAt: Date.now() + Time.HOUR * 2,
      })),
    });
    // for (const reviewer of reviewers) {
    //   // TODO: accept and decline
    //   await client.chat.postMessage({
    //     channel: reviewer.id,
    //     text: `Your review of a HackerRank has been requested!`,
    //     username: BOT_USERNAME,
    //     icon_url: BOT_ICON_URL,
    //   });
    // }

    // TODO: update spreadsheet to record requests requested review and reviewers

    await client.chat.postMessage({
      channel: user.id,
      text: 'this is required, but not used?',
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
      blocks: [
        {
          block_id: BlockId.REVIEWER_DM_CONTEXT,
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: compose(
                `${mention(user)} has requested a HackerRank done in the following languages:`,
                ul(...languages),
                bold(`The review is needed by: ${deadlineDisplay}`),
              ),
            },
          ],
        },
        {
          block_id: BlockId.REVIEWER_DM_BUTTONS,
          type: 'actions',
          elements: [
            {
              action_id: ActionId.REVIEWER_DM_ACCEPT,
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Accept',
              },
              style: 'primary',
            },
            {
              action_id: ActionId.REVIEWER_DM_DECLINE,
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Decline',
              },
              style: 'danger',
            },
          ],
        },
      ],
    });
  },
};
