export function bold(string: string): string {
  return `**${string}**`;
}

export function italic(string: string): string {
  return `_${string}_`;
}

export function compose(...lines: string[]): string {
  return lines.join('\n\n');
}

export function ul(...items: string[]): string {
  return items.map(item => '- ' + item).join('\n');
}

export function li(...items: string[]): string {
  return items.map(item => '1. ' + item).join('\n');
}
