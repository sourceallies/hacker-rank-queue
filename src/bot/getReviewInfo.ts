import { GlobalShortcutParam } from '@/slackTypes';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
import { KnownBlock, View } from '@slack/types';
import log from '@utils/log';
import { bold, formatDate, formatSlot, formatTime, mention, textBlock, ul } from '@utils/text';
import { groupByDate } from '@utils/pairingSlots';
import { InterviewFormatLabel, Interaction } from './enums';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { ActiveReview } from '@models/ActiveReview';
import { User } from '@models/User';
import { reviewActionService } from '@/services/ReviewActionService';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { PairingSession } from '@models/PairingSession';

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
            text: ":mag: We're looking for teammates to review this submission. In the meantime, here's what we know.",
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

  pairingDialog(session: PairingSession): View {
    const blocks: KnownBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:mag: Pairing session for ${bold(session.candidateName)} — requested by ${mention({ id: session.requestorId })}.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ul(
            `${bold('Format:')} ${InterviewFormatLabel.get(session.format) ?? session.format}`,
            `${bold('Languages:')} ${session.languages.join(', ')}`,
            `${bold('Teammates needed per slot:')} ${session.teammatesNeededCount}`,
            `${bold('Pending responses:')} ${session.pendingTeammates.length}`,
            `${bold('Declined:')} ${session.declinedTeammates.length}`,
          ),
        },
      },
      { type: 'divider' },
      textBlock(
        bold(
          `Candidate availability (${session.slots.length} session${session.slots.length !== 1 ? 's' : ''}):`,
        ),
      ),
      // One block per day, not per session — a week of business-hours windows slices into ~60
      // sessions, and a block each would make this modal unreadable and crowd Slack's 100 block cap.
      ...groupByDate(session.slots).map<KnownBlock>(([date, slots]) =>
        textBlock(
          `${bold(formatDate(date))}\n${ul(
            ...slots.map(({ item: slot }) => {
              const interested = slot.interestedTeammates;
              const who =
                interested.length > 0
                  ? `: ${interested.map(t => mention({ id: t.userId })).join(', ')}`
                  : '';
              return `${formatTime(slot.startTime)}–${formatTime(slot.endTime)} — ${interested.length} interested${who}`;
            }),
          )}`,
        ),
      ),
    ];
    return {
      title: { text: 'Pairing Session Info', type: 'plain_text' },
      type: 'modal',
      blocks,
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
            text: ":yikes: We don't know anything about this message. This functionality only works on pending requests. Once all reviewers have been found, this timeline view won't work any more.",
          },
        },
      ],
    };
  },

  async shortcut({ ack, shortcut, client }: GlobalShortcutParam): Promise<void> {
    log.d('getReviewInfo.shortcut', `Requesting review info, user.id=${shortcut.user.id}`);
    await ack();

    const threadTs = shortcut.message.ts;

    const pairingSession = await pairingSessionsRepo.getByThreadIdOrUndefined(threadTs);
    if (pairingSession) {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.pairingDialog(pairingSession),
      });
      return;
    }

    try {
      const activeReview = await activeReviewRepo.getReviewByThreadIdOrFail(threadTs);
      const allUsers = await userRepo.listAll();
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(activeReview, allUsers),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (_err: any) {
      log.d('getReviewInfo.shortcut', `Unable to find active review with ts ${threadTs}`);
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.missingReviewDialog(),
      });
    }
  },
};
