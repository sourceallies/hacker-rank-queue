import {
  BlockAction,
  ButtonAction,
  MessageShortcut,
  Middleware,
  SlackActionMiddlewareArgs,
  SlackShortcut,
  SlackShortcutMiddlewareArgs,
  SlackViewAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';

export type ShortcutParam = Parameters<Middleware<SlackShortcutMiddlewareArgs<SlackShortcut>>>[0];
export type WebClient = ShortcutParam['client'];
export type CallbackParam = Parameters<Middleware<SlackViewMiddlewareArgs<SlackViewAction>>>[0];
export type ViewSubmitActionParam = Parameters<
  Middleware<SlackViewMiddlewareArgs<ViewSubmitAction>>
>[0];
export type ActionParam = Parameters<
  Middleware<SlackActionMiddlewareArgs<BlockAction<ButtonAction>>>
>[0];
export type ChatResponse = {
  ts?: string;
};
export type GlobalShortcutParam = Parameters<
  Middleware<SlackShortcutMiddlewareArgs<MessageShortcut>>
>[0];
