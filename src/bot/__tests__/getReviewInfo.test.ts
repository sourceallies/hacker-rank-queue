import { App } from '@slack/bolt';
import { getReviewInfo } from '@bot/getReviewInfo';
import { buildMockGlobalShortcutParam, buildMockWebClient } from '@utils/slackMocks';
import { CandidateType, Deadline, Interaction, InterviewFormat } from '@bot/enums';
import { GlobalShortcutParam } from '@/slackTypes';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { ActiveReview } from '@models/ActiveReview';
import { userRepo } from '@repos/userRepo';
import { reviewActionService } from '@/services/ReviewActionService';
import { CreatedReviewAction } from '@/services/models/ReviewAction';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { PairingSession } from '@models/PairingSession';

describe('getReviewInfo', () => {
  let app: App;
  const boundShortCutMethod = jest.fn();

  beforeEach(() => {
    app = {
      shortcut: jest.fn() as any,
      view: jest.fn() as any,
      client: buildMockWebClient(),
    } as App;
    getReviewInfo.shortcut.bind = jest.fn().mockReturnValueOnce(boundShortCutMethod);
    getReviewInfo.setup(app);
  });

  describe('setup', () => {
    it('should run shortcut() when the "Get Review Info" shortcut is pressed', () => {
      expect(getReviewInfo.shortcut.bind).toHaveBeenCalledWith(getReviewInfo);
      expect(app.shortcut).toHaveBeenCalledWith(
        Interaction.SHORTCUT_GET_REVIEW_INFO,
        boundShortCutMethod,
      );
    });
  });

  describe('shortcut', () => {
    let param: GlobalShortcutParam;
    beforeEach(async () => {
      param = buildMockGlobalShortcutParam();
      param.shortcut.message = {
        ts: '123',
      } as any;
      const review: ActiveReview = {
        threadId: '123',
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(1650504468906),
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: 'some-id',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 1,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [],
        hackerRankUrl: '',
        yardstickUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue(review);
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);
      userRepo.listAll = jest.fn().mockResolvedValue([]);
      reviewActionService.getActions = jest
        .fn()
        .mockReturnValue([new CreatedReviewAction(1650504468906)]);
      await getReviewInfo.shortcut(param);
    });

    it("should acknowledge the request so slack knows we're working on it", () => {
      expect(param.ack).toHaveBeenCalled();
    });

    describe('when the message is a pairing session', () => {
      let pairingParam: GlobalShortcutParam;
      const session: PairingSession = {
        threadId: '123',
        requestorId: 'U123',
        candidateName: 'Dana',
        languages: ['Python', 'Go'],
        format: InterviewFormat.REMOTE,
        requestedAt: new Date(1650504468906),
        teammatesNeededCount: 2,
        slots: [
          {
            id: 'slot-1',
            date: '2026-04-20',
            startTime: '09:00',
            endTime: '10:00',
            interestedTeammates: [
              { userId: 'U456', acceptedAt: 1650504468906, formats: [InterviewFormat.REMOTE] },
            ],
          },
        ],
        pendingTeammates: [],
        declinedTeammates: [],
      };

      beforeEach(async () => {
        pairingParam = buildMockGlobalShortcutParam();
        pairingParam.shortcut.message = { ts: '123' } as any;
        pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(session);
        activeReviewRepo.getReviewByThreadIdOrFail = jest.fn();
        await getReviewInfo.shortcut(pairingParam);
      });

      it('should not query the active review repo', () => {
        expect(activeReviewRepo.getReviewByThreadIdOrFail).not.toHaveBeenCalled();
      });

      it('should open the pairing dialog', () => {
        expect(pairingParam.client.views.open).toHaveBeenCalledWith(
          expect.objectContaining({
            view: expect.objectContaining({
              title: { text: 'Pairing Session Info', type: 'plain_text' },
            }),
          }),
        );
      });
    });

    it('should open a view with the correct review information', () => {
      expect(param.client.views.open).toHaveBeenCalledWith({
        trigger_id: param.shortcut.trigger_id,
        view: {
          blocks: [
            {
              text: {
                text: ":mag: We're looking for teammates to review this submission. In the meantime, here's what we know.",
                type: 'mrkdwn',
              },
              type: 'section',
            },
            {
              type: 'divider',
            },
            {
              text: {
                text: ' •  `Wed 08:27 PM` review requested',
                type: 'mrkdwn',
              },
              type: 'section',
            },
          ],
          title: {
            text: 'Review Info',
            type: 'plain_text',
          },
          type: 'modal',
        },
      });
    });
  });
});
