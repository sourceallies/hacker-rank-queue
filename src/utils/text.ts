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
  return items.map(item => `1. ${item}`).join('\n');
}

export function codeBlock(...lines: string[]): string {
  return ['```', ...lines, '```'].join('\n');
}

export function mention(user: { id: string }): string {
  return `<@${user.id}>`;
}
