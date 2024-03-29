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
  return items.map(item => ` •  ${item}`).join('\n');
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

export function link(linkText: string, url: string) {
  return `<${url}|${linkText}>`;
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
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text,
    },
  };
}

export function errorStack(err: Error): string {
  return err.stack ?? '[no stack trace]';
}

export function shortTimeDisplay(time: number): string {
  const date = new Date(time);
  const shortDateString = date.toLocaleDateString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  return cleanse(`\`${shortDateString}\``);
}

function cleanse(str: string): string {
  return str.replace(/\s+/g, ' ');
}
