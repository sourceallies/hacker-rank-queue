import { ActionParam, CallbackParam, WebClient } from '@/slackTypes';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { PairingSession, PairingSlot } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
import { lockedExecute } from '@utils/lockedExecute';
import log from '@utils/log';
import {
  chipIndexFrom,
  parseMeta,
  PickerMeta,
  pickerView,
  snapshotOf,
  TIME_TOGGLE_PATTERN,
  toggleSelection,
} from '@utils/pairingPicker';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { reportErrorAndContinue } from '@utils/reportError';
import { reviewLockManager } from '@utils/reviewLockManager';
import { compose, formatSlot, textBlock, ul } from '@utils/text';
import { ActionId, Interaction } from './enums';

const ALREADY_FILLED =
  "This session was filled by someone else — nothing to do. You're still at the top of the queue for the next one.";

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
      if (!isStillPending(session, userId)) {
        await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(ALREADY_FILLED)]);
        return;
      }

      const meta: PickerMeta = {
        threadId,
        dmTs,
        candidateName: session.candidateName,
        languages: session.languages,
        format: session.format,
        slots: snapshotOf(session),
        selected: [],
      };
      await client.views.open({ trigger_id: body.trigger_id, view: pickerView(meta) });
    } catch (err: any) {
      await reportErrorAndContinue(pickPairingTimes.app, 'Error opening the pairing picker', {
        body,
      })(err as Error);
    }
  },

  /**
   * A repaint is a pure function of the metadata the picker already carries — no database read, so
   * a fast clicker can't burn the Sheets quota, and no reliance on button styling to say what's
   * selected.
   */
  async toggleTime({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const view = body.view;
      if (!view) throw new Error('Missing view on pairing time toggle');

      const index = chipIndexFrom(body.actions[0].action_id);
      if (index == null) {
        throw new Error(`Unrecognized pairing chip: ${body.actions[0].action_id}`);
      }

      const meta = parseMeta(view.private_metadata);
      const selected = toggleSelection(meta.selected, index);

      await client.views.update({
        view_id: view.id,
        hash: view.hash,
        view: pickerView({ ...meta, selected }),
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
      const meta = parseMeta(body.view.private_metadata);
      if (!meta.threadId || !meta.dmTs) {
        throw new Error('Missing threadId or message timestamp on pairing time submit');
      }

      if (meta.selected.length === 0) {
        await decline(
          userId,
          meta.threadId,
          "You didn't pick any times — we've moved on to the next person.",
        );
        return;
      }

      await lockedExecute(reviewLockManager.getLock(meta.threadId), async () => {
        const session = await pairingSessionsRepo.getByThreadIdOrUndefined(meta.threadId);
        if (!isStillPending(session, userId)) {
          await chatService.updateDirectMessage(client, userId, meta.dmTs, [
            textBlock(ALREADY_FILLED),
          ]);
          return;
        }

        // Resolve against what the picker showed, not by position — a slot's identity is its date
        // and start time, and matching on those survives any future reordering of session.slots.
        const picked = new Set(
          meta.selected.map(i => `${meta.slots[i]?.date}T${meta.slots[i]?.startTime}`),
        );
        const pickedIds = session.slots
          .filter(slot => picked.has(`${slot.date}T${slot.startTime}`))
          .map(slot => slot.id);

        const user = await userRepo.find(userId);
        const updated = await pairingRequestService.recordSlotSelections(
          session,
          userId,
          pickedIds,
          user?.formats ?? [],
        );

        // recordSlotSelections skips slots that already have enough teammates, so report what
        // actually landed — otherwise someone holds a time the session has no record of.
        const recorded = updated.slots.filter(slot =>
          slot.interestedTeammates.some(t => t.userId === userId),
        );
        await confirmToTeammate(client, userId, meta.dmTs, updated, recorded);

        const closed = await pairingSessionCloser.closeIfComplete(
          pickPairingTimes.app,
          meta.threadId,
        );
        if (!closed) {
          await pairingRequestService.requestNextTeammate(pickPairingTimes.app, updated);
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
      const threadId = body.actions[0].value;
      if (!threadId) throw new Error('Missing threadId on pairing decline');

      await decline(body.user.id, threadId, "You're all set — we've moved to the next person.");
    } catch (err: any) {
      await reportErrorAndContinue(pickPairingTimes.app, 'Error handling pairing decline', {
        body,
      })(err as Error);
    }
  },
};

function isStillPending(
  session: PairingSession | undefined,
  userId: string,
): session is PairingSession {
  return !!session && session.pendingTeammates.some(t => t.userId === userId);
}

/** Both ways of passing — the decline button, and submitting with nothing picked — land here. */
async function decline(userId: string, threadId: string, message: string): Promise<void> {
  await lockedExecute(reviewLockManager.getLock(threadId), async () => {
    const session = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);
    if (!isStillPending(session, userId)) {
      log.d('pickPairingTimes.decline', `User ${userId} already responded to ${threadId}`);
      return;
    }
    await pairingRequestService.declineTeammate(pickPairingTimes.app, session, userId, message);
  });
}

async function confirmToTeammate(
  client: WebClient,
  userId: string,
  dmTs: string,
  session: PairingSession,
  recorded: PairingSlot[],
): Promise<void> {
  const header = pairingRequestBuilder.sessionHeader(session);

  const text =
    recorded.length > 0
      ? compose(
          `*Thanks for your availability!* Here's what you submitted:`,
          header,
          `*Your available times:*\n${ul(
            ...recorded.map(s => formatSlot(s.date, s.startTime, s.endTime)),
          )}`,
          `If one of your times is picked, you'll be tagged in #interviewing to coordinate scheduling. If not, you'll stay at the top of the queue for the next interview.`,
        )
      : compose(
          `*Every time you picked was already covered* by other teammates, so we haven't put you down for anything.`,
          header,
          `Nothing to do — you'll stay at the top of the queue for the next interview.`,
        );

  await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(text)]);
}
