import { GlobalShortcutParam } from '@/slackTypes';
import { userRepo } from '@repos/userRepo';
import { App, View } from '@slack/bolt';
import log from '@utils/log';
import { ul } from '@utils/text';
import { Interaction } from './enums';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { ActiveReview } from '@models/ActiveReview';
import { User } from '@models/User';
import { reviewActionService } from '@/services/ReviewActionService';

export const getReviewInfo = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('getReviewInfo.setup', `Setting up ${Interaction.SHORTCUT_GET_REVIEW_INFO} shortcut`);
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_GET_REVIEW_INFO, this.shortcut.bind(this));
  },

  dialog(activeReview: ActiveReview, users: User[]): View {
    const reviewActions = reviewActionService
      .getActions(activeReview, users)
      .map(action => action.toMarkdown());
    return {
      title: {
        text: 'Review Info',
        type: 'plain_text',
      },
      type: 'modal',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ":mag: We're looking for teammates to review this HackerRank. In the meantime, here's what we know.",
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ul(...reviewActions),
          },
        },
      ],
    };
  },

  missingReviewDialog(): View {
    return {
      title: {
        text: 'Review Info',
        type: 'plain_text',
      },
      type: 'modal',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ":yikes: We don't know anything about this message. This functionality only works on pending HackerRank requests. Once all reviewers have been found, this timeline view won't work any more.",
          },
        },
      ],
    };
  },

  async shortcut({ ack, shortcut, client }: GlobalShortcutParam): Promise<void> {
    log.d('getReviewInfo.shortcut', `Requesting review info, user.id=${shortcut.user.id}`);
    await ack();

    try {
      const activeReview = await activeReviewRepo.getReviewByThreadIdOrFail(shortcut.message.ts);
      const allUsers = await userRepo.listAll();
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(activeReview, allUsers),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.d(
        'getReviewInfo.shortcut',
        `Unable to find active review with ts ${shortcut.message.ts}`,
      );
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.missingReviewDialog(),
      });
    }
  },
};
