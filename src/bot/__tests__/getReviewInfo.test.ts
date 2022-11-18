import { App } from '@slack/bolt';
import { getReviewInfo } from '@bot/getReviewInfo';
import { buildMockGlobalShortcutParam, buildMockWebClient } from '@utils/slackMocks';
import { Deadline, Interaction } from '@bot/enums';
import { GlobalShortcutParam } from '@/slackTypes';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { ActiveReview } from '@models/ActiveReview';
import { userRepo } from '@repos/userRepo';
import { reviewActionService } from '@/services/ReviewActionService';
import { CreatedReviewAction } from '@/services/models/ReviewAction';

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
      expect(getReviewInfo.shortcut.bind).toBeCalledWith(getReviewInfo);
      expect(app.shortcut).toBeCalledWith(
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
        reviewersNeededCount: 1,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [],
      };
      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue(review);
      userRepo.listAll = jest.fn().mockResolvedValue([]);
      reviewActionService.getActions = jest
        .fn()
        .mockReturnValue([new CreatedReviewAction(1650504468906)]);
      await getReviewInfo.shortcut(param);
    });

    it("should acknowledge the request so slack knows we're working on it", () => {
      expect(param.ack).toBeCalled();
    });

    it('should open a view with the correct review information', () => {
      expect(param.client.views.open).toHaveBeenCalledWith({
        trigger_id: param.shortcut.trigger_id,
        view: {
          blocks: [
            {
              text: {
                text: ":mag: We're looking for teammates to review this HackerRank. In the meantime, here's what we know.",
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
