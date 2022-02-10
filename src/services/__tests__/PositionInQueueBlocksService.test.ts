import { positionInQueueBlocksService } from '@/services/PositionInQueueBlocksService';
import { SectionBlock } from '@slack/types';
import { DividerBlock, HeaderBlock } from '@slack/bolt';

describe('PositionInQueueBlocksService', () => {
  describe('buildBlocks', () => {
    const USER = {
      id: 'user1',
      name: 'User 1',
      languages: ['Java', 'C#'],
      lastReviewedDate: 1644520881026,
    };

    it('should return information about the user and their position in the queue', () => {
      const positionInformation = {
        user: USER,
        languagePositions: [
          {
            position: 7,
            totalUsers: 20,
            language: 'Java',
          },
          {
            position: 8,
            totalUsers: 15,
            language: 'C#',
          },
        ],
      };
      const blocks = positionInQueueBlocksService.buildBlocks(positionInformation);

      expect(blocks).toHaveLength(5);

      const headerBlock = blocks[0] as HeaderBlock;
      expect(headerBlock.type).toEqual('header');
      expect(headerBlock.text.text).toEqual(
        ":wave: Hi! Here's what we know about your spot in the queue.",
      );

      const highLevelBlock = blocks[1] as SectionBlock;
      expect(highLevelBlock.type).toEqual('section');
      const highLevelText = highLevelBlock.text?.text;
      expect(highLevelText).toContain("*Languages You'd Like To Review:*\nJava, C#");
      expect(highLevelText).toContain('*Last Review Date:*\nThu Feb 10 2022');
      expect(highLevelText).toContain('*Approximate Position in Queue:*\nBetween 7 - 8');

      const dividerBlock = blocks[2] as DividerBlock;
      expect(dividerBlock.type).toEqual('divider');

      const detailedDescriptionBlock = blocks[3] as SectionBlock;
      expect(detailedDescriptionBlock.type).toEqual('section');
      expect(detailedDescriptionBlock.text?.text).toContain(
        'We match teammates to reviews based on language',
      );

      const detailedInfoBlock = blocks[4] as SectionBlock;
      expect(detailedInfoBlock.type).toEqual('section');
      expect(detailedInfoBlock.text?.text).toContain('*Java:*\n7 out of 20 teammates');
      expect(detailedInfoBlock.text?.text).toContain('*C#:*\n8 out of 15 teammates');
    });

    it('should use a last reviewed date of "Never" for a user that has never performed a review', () => {
      const userWithNoReviewDate = {
        id: 'user1',
        name: 'User 1',
        languages: ['Java', 'C#'],
        lastReviewedDate: undefined,
      };

      const positionInformation = {
        user: userWithNoReviewDate,
        languagePositions: [
          {
            position: 7,
            totalUsers: 20,
            language: 'Java',
          },
        ],
      };

      const blocks = positionInQueueBlocksService.buildBlocks(positionInformation);

      expect(blocks).toHaveLength(5);
      const highLevelBlock = blocks[1] as SectionBlock;
      expect(highLevelBlock.text?.text).toContain('*Last Review Date:*\nNever');
    });

    it('should show a position of exactly one value if the users place in the queue is a single value', () => {
      const positionInformation = {
        user: USER,
        languagePositions: [
          {
            position: 7,
            totalUsers: 20,
            language: 'Java',
          },
        ],
      };

      const blocks = positionInQueueBlocksService.buildBlocks(positionInformation);

      expect(blocks).toHaveLength(5);
      const highLevelBlock = blocks[1] as SectionBlock;
      expect(highLevelBlock.text?.text).toContain('*Approximate Position in Queue:*\n7');
    });

    it('should show a position between two numbers if their place in the queue could be several places apart', () => {
      const positionInformation = {
        user: USER,
        languagePositions: [
          {
            position: 7,
            totalUsers: 20,
            language: 'Java',
          },
          {
            position: 10,
            totalUsers: 40,
            language: 'JavaScript',
          },
          {
            position: 4,
            totalUsers: 9,
            language: 'Other',
          },
        ],
      };

      const blocks = positionInQueueBlocksService.buildBlocks(positionInformation);

      expect(blocks).toHaveLength(5);
      const highLevelBlock = blocks[1] as SectionBlock;
      expect(highLevelBlock.text?.text).toContain(
        '*Approximate Position in Queue:*\nBetween 4 - 10',
      );
    });
  });
});
