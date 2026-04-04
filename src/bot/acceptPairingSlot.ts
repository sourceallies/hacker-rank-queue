import { ActionParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId, BlockId } from './enums';
import { userRepo } from '@repos/userRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingInterviewCloser } from '@/services/PairingInterviewCloser';
import { reviewLockManager } from '@utils/reviewLockManager';
import { lockedExecute } from '@utils/lockedExecute';
import { reportErrorAndContinue } from '@utils/reportError';
import { textBlock } from '@utils/text';
import { chatService } from '@/services/ChatService';

export const acceptPairingSlot = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('acceptPairingSlot.setup', 'Setting up acceptPairingSlot action handlers');
    this.app = app;
    app.action(ActionId.PAIRING_SUBMIT_SLOTS, this.handleSubmitSlots.bind(this));
    app.action(ActionId.PAIRING_DECLINE_ALL, this.handleDeclineAll.bind(this));
  },

  async handleSubmitSlots({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      const messageTimestamp = body.message?.ts;
      if (!threadId || !messageTimestamp) {
        throw new Error('Missing threadId or messageTimestamp on pairing slot submit');
      }

      const selectedOptions: Array<{ value: string }> =
        (body as any).state?.values?.[BlockId.PAIRING_DM_SLOTS]?.[ActionId.PAIRING_SLOT_SELECTIONS]
          ?.selected_options ?? [];
      const selectedSlotIds = selectedOptions.map(o => o.value);

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);
        if (!interview) return;

        const isPending = interview.pendingTeammates.some(t => t.userId === userId);
        if (!isPending) {
          log.d('acceptPairingSlot', `User ${userId} already responded to ${threadId}`);
          return;
        }

        const user = await userRepo.find(userId);
        const userFormats = user?.formats ?? [];

        await pairingRequestService.recordSlotSelections(
          interview,
          userId,
          selectedSlotIds,
          userFormats,
        );
        await userRepo.markNowAsLastReviewedDate(userId);

        await chatService.updateDirectMessage(client, userId, messageTimestamp, [
          textBlock(`*Thanks! You've submitted your availability.*`),
        ]);

        await pairingInterviewCloser.closeIfComplete(acceptPairingSlot.app, threadId);
      });
    } catch (err: any) {
      await reportErrorAndContinue(acceptPairingSlot.app, 'Error handling pairing slot submit', {
        body,
      })(err as Error);
    }
  },

  async handleDeclineAll({ ack, body }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      if (!threadId) throw new Error('Missing threadId on pairing decline');

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);
        if (!interview) return;

        const isPending = interview.pendingTeammates.some(t => t.userId === userId);
        if (!isPending) {
          log.d('acceptPairingSlot.handleDeclineAll', `User ${userId} already responded`);
          return;
        }

        await pairingRequestService.declineTeammate(
          acceptPairingSlot.app,
          interview,
          userId,
          "You're all set — we've moved to the next person.",
        );
      });
    } catch (err: any) {
      await reportErrorAndContinue(acceptPairingSlot.app, 'Error handling pairing decline', {
        body,
      })(err as Error);
    }
  },
};
