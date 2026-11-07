import { ActionParam, CallbackParam, WebClient } from '@/slackTypes';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { pairingSessions } from '@/services/ThreadRecords';
import { respond, slotKey, Standing, standingOf } from '@/services/pairingSessionRules';
import { PairingSession, PairingSlot } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
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
import { compose, formatSlot, textBlock, ul } from '@utils/text';
import { ActionId, Interaction } from './enums';

const ALREADY_FILLED =
  "This session was filled by someone else — nothing to do. You're still at the top of the queue for the next one.";

const ALREADY_COVERED =
  "*Every time you picked was already covered* by other teammates, so we haven't put you down for anything. You'll stay at the top of the queue for the next interview.";

const STILL_SETTING_UP =
  "This request is still being set up — give it a few seconds and tap again. (Nothing's lost; your buttons are still above.)";

const ALREADY_RESPONDED =
  "You've already responded to this request — nothing more to do. We'll tag you in #interviewing if one of your times is picked.";

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
      const standing = standingOf(session, userId);
      if (standing !== 'pending') {
        await reportStanding(client, userId, dmTs, standing);
        return;
      }

      const meta: PickerMeta = {
        threadId,
        dmTs,
        candidateName: session!.candidateName,
        languages: session!.languages,
        format: session!.format,
        slots: snapshotOf(session!),
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

      await pairingSessions.withRecord(
        meta.threadId,
        async session => {
          const standing = standingOf(session, userId);
          if (standing !== 'pending') {
            await reportStanding(client, userId, meta.dmTs, standing);
            return;
          }

          const user = await userRepo.find(userId);
          const pickedSlotKeys = meta.selected.flatMap(i =>
            meta.slots[i] ? [slotKey(meta.slots[i])] : [],
          );
          const response = respond(
            session,
            { userId, formats: user?.formats ?? [] },
            pickedSlotKeys,
            Date.now(),
          );

          if (response.outcome === 'all-covered') {
            await pairingRequestService.declineTeammate(
              pickPairingTimes.app,
              session,
              userId,
              ALREADY_COVERED,
            );
            return;
          }

          const updated = response.session;
          await pairingSessionsRepo.update(updated);
          await confirmToTeammate(client, userId, meta.dmTs, updated, response.recorded);

          const closed = await pairingSessionCloser.closeIfComplete(
            pickPairingTimes.app,
            meta.threadId,
          );
          if (!closed) {
            await pairingRequestService.requestNextTeammate(pickPairingTimes.app, updated);
          }
        },
        () => reportStanding(client, userId, meta.dmTs, 'gone'),
      );
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

/**
 * Tells a teammate why we're not taking their answer.
 *
 * 'setting-up' deliberately posts a NEW message instead of rewriting the DM: their buttons are still
 * valid and will work in a moment, so collapsing the DM would strand them.
 *
 * 'responded' and 'gone' get different copy on purpose — telling someone who already answered that
 * the session "was filled by someone else" is simply untrue, and it isn't even known to be filled.
 */
async function reportStanding(
  client: WebClient,
  userId: string,
  dmTs: string,
  standing: Exclude<Standing, 'pending'>,
): Promise<void> {
  if (standing === 'setting-up') {
    log.d('pickPairingTimes', `Session not ready for ${userId} yet; leaving their DM intact`);
    await chatService.sendDirectMessage(client, userId, STILL_SETTING_UP);
    return;
  }

  const message = standing === 'responded' ? ALREADY_RESPONDED : ALREADY_FILLED;
  await chatService.updateDirectMessage(client, userId, dmTs, [textBlock(message)]);
}

/** Both ways of passing — the decline button, and submitting with nothing picked — land here. */
async function decline(userId: string, threadId: string, message: string): Promise<void> {
  await pairingSessions.withRecord(threadId, async session => {
    if (standingOf(session, userId) !== 'pending') {
      log.d('pickPairingTimes.decline', `User ${userId} can't decline ${threadId} right now`);
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
  await chatService.updateDirectMessage(client, userId, dmTs, [
    textBlock(
      compose(
        `*Thanks for your availability!* Here's what you submitted:`,
        pairingRequestBuilder.sessionHeader(session),
        `*Your available times:*\n${ul(
          ...recorded.map(s => formatSlot(s.date, s.startTime, s.endTime)),
        )}`,
        `If one of your times is picked, you'll be tagged in #interviewing to coordinate scheduling. If not, you'll stay at the top of the queue for the next interview.`,
      ),
    ),
  ]);
}
