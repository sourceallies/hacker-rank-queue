import { PositionInformation } from '@/services/models/PositionInformation';
import { KnownBlock, SectionBlock } from '@slack/types';
import { DividerBlock, HeaderBlock } from '@slack/bolt';

function buildBlocks(positionInformation: PositionInformation): KnownBlock[] {
  const header = buildHeader();
  const highLevelBlock = buildHighLevelBlock(positionInformation);
  const divider: DividerBlock = { type: 'divider' };
  const detailedInfoDescriptionBlock = buildDetailedInfoDescriptionBlock();
  const detailedInfoBlock = buildDetailedInfoBlock(positionInformation);

  return [header, highLevelBlock, divider, detailedInfoDescriptionBlock, detailedInfoBlock];
}

function buildHeader(): HeaderBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: ":wave: Hi! Here's what we know about your spot in the queue.",
    },
  };
}

function buildLanguageSection(positionInformation: PositionInformation): string {
  const userLanguages = positionInformation.user.languages.join(', ');
  return `*Languages You'd Like To Review:*\n${userLanguages}`;
}

function buildLastReviewedDateSection(positionInformation: PositionInformation): string {
  const lastReviewDate = Number(positionInformation.user.lastReviewedDate);
  let lastReviewDateString = 'Never';
  if (lastReviewDate) {
    lastReviewDateString = new Date(lastReviewDate).toDateString();
  }
  return `*Last Review Date:*\n${lastReviewDateString}`;
}

function buildPositionSection(positionInformation: PositionInformation): string {
  const allPositions = positionInformation.languagePositions.map(l => l.position);
  const minPosition = allPositions.reduce((prev, curr) => (prev < curr ? prev : curr));
  const maxPosition = allPositions.reduce((prev, curr) => (prev > curr ? prev : curr));

  let positionString;
  if (minPosition != maxPosition) {
    positionString = `Between ${minPosition} - ${maxPosition}`;
  } else {
    positionString = `${minPosition}`;
  }
  return `*Approximate Position in Queue:*\n${positionString}`;
}

function buildHighLevelBlock(positionInformation: PositionInformation): SectionBlock {
  const highLevelInfo = [
    buildLanguageSection(positionInformation),
    buildLastReviewedDateSection(positionInformation),
    buildPositionSection(positionInformation),
  ].join('\n\n');

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: highLevelInfo,
    },
  };
}

function buildDetailedInfoDescriptionBlock(): SectionBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        'We match teammates to reviews based on language so your position in the ' +
        'queue is determined based on the reviews that come in. To get a better idea of' +
        " where you're at on a per-language basis we've detailed that information here.",
    },
  };
}

function buildDetailedInfoBlock(positionInformation: PositionInformation): SectionBlock {
  const positionStrings = positionInformation.languagePositions.map(
    languagePosition =>
      `*${languagePosition.language}:*\n${languagePosition.position} out of ${languagePosition.totalUsers} teammates`,
  );

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: positionStrings.join('\n\n'),
    },
  };
}

export const positionInQueueBlocksService = {
  buildBlocks,
};
