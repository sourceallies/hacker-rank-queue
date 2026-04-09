import { ActionParam, CallbackParam, ShortcutParam } from '@/slackTypes';
import { User } from '@models/User';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
import { Option, View } from '@slack/types';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose } from '@utils/text';
import {
  ActionId,
  InterviewFormat,
  InterviewFormatLabel,
  InterviewType,
  InterviewTypeLabel,
  Interaction,
} from './enums';
import { chatService } from '@/services/ChatService';

export const joinQueue = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('joinQueue.setup', 'Setting up JoinQueue command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_JOIN_QUEUE, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_JOIN_QUEUE, this.callback.bind(this));
    app.action(ActionId.LEAVE_QUEUE, this.handleLeaveQueue.bind(this));
  },

  dialog(languages: string[], existingUser?: User): View {
    const initialOptions = <T extends string>(
      options: Option[],
      saved: T[] | undefined,
    ): Option[] | undefined => {
      if (!saved?.length) return undefined;
      const filtered = options.filter(o => saved.includes(o.value as T));
      return filtered.length ? filtered : undefined;
    };

    const languageOptions = languages.map<Option>(lang => ({
      text: { text: lang, type: 'plain_text' },
      value: lang,
    }));

    const interviewTypeOptions: Option[] = [
      {
        text: { text: InterviewTypeLabel.get(InterviewType.HACKERRANK)!, type: 'plain_text' },
        value: InterviewType.HACKERRANK,
      },
      {
        text: { text: InterviewTypeLabel.get(InterviewType.PAIRING)!, type: 'plain_text' },
        value: InterviewType.PAIRING,
      },
    ];

    const formatOptions: Option[] = [
      {
        text: { text: InterviewFormatLabel.get(InterviewFormat.REMOTE)!, type: 'plain_text' },
        value: InterviewFormat.REMOTE,
      },
      {
        text: { text: InterviewFormatLabel.get(InterviewFormat.IN_PERSON)!, type: 'plain_text' },
        value: InterviewFormat.IN_PERSON,
      },
    ];

    return {
      title: { text: 'Queue Preferences', type: 'plain_text' },
      type: 'modal',
      callback_id: Interaction.SUBMIT_JOIN_QUEUE,
      blocks: [
        {
          type: 'input',
          block_id: ActionId.LANGUAGE_SELECTIONS,
          label: { text: 'What languages are you comfortable with?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.LANGUAGE_SELECTIONS,
            options: languageOptions,
            ...(initialOptions(languageOptions, existingUser?.languages) && {
              initial_options: initialOptions(languageOptions, existingUser?.languages),
            }),
          },
        },
        {
          type: 'input',
          block_id: ActionId.INTERVIEW_TYPE_SELECTIONS,
          label: { text: 'Which interview types are you available for?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.INTERVIEW_TYPE_SELECTIONS,
            options: interviewTypeOptions,
            ...(initialOptions(interviewTypeOptions, existingUser?.interviewTypes) && {
              initial_options: initialOptions(interviewTypeOptions, existingUser?.interviewTypes),
            }),
          },
        },
        {
          type: 'input',
          block_id: ActionId.INTERVIEW_FORMAT_SELECTION,
          label: { text: 'Which interview formats can you participate in?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.INTERVIEW_FORMAT_SELECTION,
            options: formatOptions,
            ...(initialOptions(formatOptions, existingUser?.formats) && {
              initial_options: initialOptions(formatOptions, existingUser?.formats),
            }),
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: ActionId.LEAVE_QUEUE,
              text: { type: 'plain_text', text: 'Leave Queue' },
              style: 'danger',
              confirm: {
                title: { type: 'plain_text', text: 'Leave the interview queue?' },
                text: { type: 'mrkdwn', text: 'You will be removed from all interview routing.' },
                confirm: { type: 'plain_text', text: 'Leave' },
                deny: { type: 'plain_text', text: 'Cancel' },
              },
            },
          ],
        },
      ],
      submit: { type: 'plain_text', text: 'Save Preferences' },
    };
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('joinQueue.shortcut', `Opening queue preferences, user.id=${shortcut.user.id}`);
    await ack();
    try {
      const [languages, existingUser] = await Promise.all([
        languageRepo.listAll(),
        userRepo.find(shortcut.user.id),
      ]);
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages, existingUser ?? undefined),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('joinQueue.shortcut', 'Failed', err);
      await chatService.sendDirectMessage(
        client,
        shortcut.user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();
    const languages = blockUtils.getLanguageFromBody(body);
    const interviewTypes = blockUtils
      .getBlockValue(body, ActionId.INTERVIEW_TYPE_SELECTIONS)
      .selected_options.map(({ value }: { value: string }) => value) as InterviewType[];
    const formats = blockUtils
      .getBlockValue(body, ActionId.INTERVIEW_FORMAT_SELECTION)
      .selected_options.map(({ value }: { value: string }) => value) as InterviewFormat[];
    const userId = body.user.id;

    log.d('joinQueue.callback', 'Preferences submitted', {
      userId,
      languages,
      interviewTypes,
      formats,
    });

    try {
      let text: string;
      const existingUser = await userRepo.find(userId);
      if (existingUser == null) {
        await userRepo.create({
          id: userId,
          name: body.user.name,
          languages,
          interviewTypes,
          formats,
          lastReviewedDate: undefined,
          lastPairingReviewedDate: undefined,
        });
        text = compose(
          `You've been added to the queue! You'll receive DMs when you're selected for:`,
          bold(languages.join(', ')),
          `When it's your turn, you'll have ${process.env.REQUEST_EXPIRATION_MIN} minutes to respond.`,
        );
      } else {
        await userRepo.update({ ...existingUser, languages, interviewTypes, formats });
        text = compose('Preferences updated!');
      }
      await chatService.sendDirectMessage(client, userId, text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('joinQueue.callback', 'Failed to update user', err);
      await chatService.sendDirectMessage(
        client,
        userId,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async handleLeaveQueue({ ack, body, client }: ActionParam): Promise<void> {
    await ack();
    const userId = body.user.id;
    log.d('joinQueue.handleLeaveQueue', `Removing user ${userId} from queue`);
    try {
      await userRepo.remove(userId);
      await client.views.update({
        view_id: body.view!.id,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Queue Preferences' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "You've been removed from the interview queue. Use the 'Interview Queue Preferences' shortcut to rejoin.",
              },
            },
          ],
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('joinQueue.handleLeaveQueue', 'Failed to remove user', err);
      await chatService.sendDirectMessage(
        client,
        userId,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },
};
