import { KnownBlock } from '@slack/types';

export function bold(string: string): string {
  return `*${string}*`;
}

export function italic(string: string): string {
  return `_${string}_`;
}

export function compose(...paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

export function ul(...items: string[]): string {
  return items.map(item => `  •  ${item}`).join('\n');
}

export function li(...items: string[]): string {
  return items.map((item, index) => `  ${index + 1}.  ${item}`).join('\n');
}

export function codeBlock(...lines: string[]): string {
  return ['```', ...lines, '```'].join('\n');
}

export function mention(user: { id: string }): string {
  return `<@${user.id}>`;
}

export function titleBlock(title: string): KnownBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: title,
      emoji: true,
    },
  };
}

export function textBlock(text: string): KnownBlock {
  return {
    type: 'context',
    elements: [
      {
        type: 'plain_text',
        text: text,
        emoji: true,
      },
    ],
  };
}

export function errorStack(err: Error): string {
  return err.stack ?? '[no stack trace]';
}
