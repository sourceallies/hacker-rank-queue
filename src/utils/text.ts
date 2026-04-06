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

export function formatSlot(date: string, startTime: string, endTime: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
  const monthStr = dateObj.toLocaleDateString('en-US', { month: 'short' });
  return `${dayOfWeek}, ${monthStr} ${day}, ${formatTime(startTime)}–${formatTime(endTime)}`;
}

function formatTime(hhmm: string): string {
  const [hourStr, minuteStr] = hhmm.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const minuteDisplay = minute === 0 ? '' : `:${minuteStr}`;
  return `${hour12}${minuteDisplay} ${period}`;
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
