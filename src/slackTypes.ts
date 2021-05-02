import {
  Middleware,
  SlackShortcut,
  SlackShortcutMiddlewareArgs,
  SlackViewAction,
  SlackViewMiddlewareArgs,
} from '@slack/bolt';

export type ShortcutParam = Parameters<Middleware<SlackShortcutMiddlewareArgs<SlackShortcut>>>[0];
export type WebClient = ShortcutParam['client'];
export type CallbackParam = Parameters<Middleware<SlackViewMiddlewareArgs<SlackViewAction>>>[0];
