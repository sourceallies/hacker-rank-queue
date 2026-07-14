import { ActionParam, CallbackParam } from '@/slackTypes';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { PairingSession } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
import { lockedExecute } from '@utils/lockedExecute';
import log from '@utils/log';
import {
  applyToggle,
  buildPickerView,
  PickerMeta,
  TIME_TOGGLE_PATTERN,
  viewFrom,
} from '@utils/pairingPicker';
import { reportErrorAndContinue } from '@utils/reportError';
import { reviewLockManager } from '@utils/reviewLockManager';
import { bold, compose, formatSlot, textBlock, ul } from '@utils/text';
import { ActionId, Interaction, InterviewFormatLabel } from './enums';

const ALREADY_FILLED =
  "This session was filled by someone else — nothing to do. You're still at the top of the queue for the next one.";

function readMeta(view: { private_metadata?: string } | undefined): PickerMeta {
  return JSON.parse(view?.private_metadata || '{"threadId":"","dmTs":"","selected":[]}');
}

export const pickPairingTimes = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('pickPairingTimes.setup', 'Setting up pairing time picker handlers');
    this.app = app;
    app.action(ActionId.PAIRING_OPEN_PICKER, this.openPicker.bind(this));
    app.action(TIME_TOGGLE_PATTERN, this.toggleTime.bind(this));
    app.action(ActionId.PAIRING_DECLINE_ALL, this.declineAll.bind(this));
    app.view(Interaction.SUBMIT_PAIRING_TIMES, this.submitTimes.bind(this));
  },

  async openPicker({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      const dmTs = body.message?.ts;
      if (!threadId || !dmTs) {
        throw new Error('Missing threadId or message timestamp when opening the pairing picker');
      }

      const session = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);
      if (!session || !session.pendingTeammates.some(t => t.userId === userId)) {
        await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(ALREADY_FILLED)]);
        return;
      }

      const meta: PickerMeta = { threadId, dmTs, selected: [] };
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildPickerView(session, meta),
      });
    } catch (err: any) {
      await reportErrorAndContinue(pickPairingTimes.app, 'Error opening the pairing picker', {
        body,
      })(err as Error);
    }
  },

  /**
   * Buttons carry no view state of their own, so a tap repaints the grid from the view Slack sent
   * us. The session is deliberately not re-read: it can't change while the picker is open, and
   * getByThreadIdOrUndefined pulls every row of the sheet — a cost we'd otherwise pay per tap.
   */
  async toggleTime({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const view = body.view;
      if (!view) throw new Error('Missing view on pairing time toggle');

      const chipValue = body.actions[0].value ?? '';
      const index = Number(chipValue.split('|')[0]);
      if (!Number.isInteger(index)) {
        throw new Error(`Unparseable pairing chip value: ${chipValue}`);
      }

      const meta = readMeta(view);
      const toggled = applyToggle(view.blocks as any, index);

      await client.views.update({
        view_id: view.id,
        hash: view.hash,
        view: viewFrom(toggled.blocks, { ...meta, selected: toggled.selected }),
      });
    } catch (err: any) {
      // Tapping several chips in quick succession puts overlapping updates in flight, and Slack
      // rejects the ones built from a superseded view. That's the hash guard doing its job — the
      // user's next tap repaints from the current view — not something to page anyone about.
      if (err?.data?.error === 'hash_conflict') {
        log.d('pickPairingTimes.toggleTime', 'Superseded by a newer view; dropping this repaint');
        return;
      }
      await reportErrorAndContinue(pickPairingTimes.app, 'Error toggling a pairing time', {
        body,
      })(err as Error);
    }
  },

  async submitTimes({ ack, body, client }: CallbackParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const { threadId, dmTs, selected } = readMeta(body.view);
      if (!threadId || !dmTs) {
        throw new Error('Missing threadId or message timestamp on pairing time submit');
      }

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const session = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);
        if (!session || !session.pendingTeammates.some(t => t.userId === userId)) {
          await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(ALREADY_FILLED)]);
          return;
        }

        if (selected.length === 0) {
          await pairingRequestService.declineTeammate(
            pickPairingTimes.app,
            session,
            userId,
            "You didn't pick any times — we've moved on to the next person.",
          );
          return;
        }

        const selectedSlots = selected.map(i => session.slots[i]).filter(Boolean);
        const user = await userRepo.find(userId);

        const updatedSession = await pairingRequestService.recordSlotSelections(
          session,
          userId,
          selectedSlots.map(s => s.id),
          user?.formats ?? [],
        );

        // recordSlotSelections silently skips slots that already have enough teammates, so report
        // what actually landed — otherwise someone holds a time the session has no record of.
        const recordedSlots = updatedSession.slots.filter(slot =>
          slot.interestedTeammates.some(t => t.userId === userId),
        );
        await confirmToTeammate(client, userId, dmTs, updatedSession, recordedSlots);

        const closed = await pairingSessionCloser.closeIfComplete(pickPairingTimes.app, threadId);
        if (!closed) {
          await pairingRequestService.requestNextTeammate(pickPairingTimes.app, updatedSession);
        }
      });
    } catch (err: any) {
      await reportErrorAndContinue(pickPairingTimes.app, 'Error submitting pairing times', {
        body,
      })(err as Error);
    }
  },

  async declineAll({ ack, body }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      if (!threadId) throw new Error('Missing threadId on pairing decline');

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const session = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);
        if (!session) return;

        if (!session.pendingTeammates.some(t => t.userId === userId)) {
          log.d('pickPairingTimes.declineAll', `User ${userId} already responded`);
          return;
        }

        await pairingRequestService.declineTeammate(
          pickPairingTimes.app,
          session,
          userId,
          "You're all set — we've moved to the next person.",
        );
      });
    } catch (err: any) {
      await reportErrorAndContinue(pickPairingTimes.app, 'Error handling pairing decline', {
        body,
      })(err as Error);
    }
  },
};

async function confirmToTeammate(
  client: ActionParam['client'],
  userId: string,
  dmTs: string,
  session: PairingSession,
  recordedSlots: PairingSession['slots'],
): Promise<void> {
  const header = compose(
    bold(`Candidate: ${session.candidateName}`),
    bold(`Languages: ${session.languages.join(', ')}`),
    bold(`Format: ${InterviewFormatLabel.get(session.format) ?? session.format}`),
  );

  const body =
    recordedSlots.length > 0
      ? compose(
          `*Thanks for your availability!* Here's what you submitted:`,
          header,
          `*Your available times:*\n${ul(
            ...recordedSlots.map(s => formatSlot(s.date, s.startTime, s.endTime)),
          )}`,
          `If one of your times is picked, you'll be tagged in #interviewing to coordinate scheduling. If not, you'll stay at the top of the queue for the next interview.`,
        )
      : compose(
          `*Every time you picked was already covered* by other teammates, so we haven't put you down for anything.`,
          header,
          `Nothing to do — you'll stay at the top of the queue for the next interview.`,
        );

  await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(body)]);
}
