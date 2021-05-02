import { ShortcutParam, WebClient } from '@/slackTypes';
import { AckFn, GlobalShortcut, MessageShortcut, SlackShortcut } from '@slack/bolt';

export const buildMockAck = (): AckFn<void> => jest.fn();
export const buildMockGlobalShortcut = (): GlobalShortcut => ({
  type: 'shortcut',
  trigger_id: Symbol('globalShortcut.trigger_id') as any,
  callback_id: Symbol('globalShortcut.callback_id') as any,
  user: {
    id: Symbol('globalShortcut.user.id') as any,
    username: Symbol('globalShortcut.user.username') as any,
    team_id: Symbol('globalShortcut.user.team_id') as any,
  },
  team: {
    id: Symbol('globalShortcut.team.id') as any,
    domain: Symbol('globalShortcut.team.domain') as any,
    enterprise_id: Symbol('globalShortcut.team.enterprise_id') as any,
    enterprise_name: Symbol('globalShortcut.team.enterprise_name') as any,
  },
  token: Symbol('globalShortcut.token') as any,
  action_ts: Symbol('globalShortcut.action_ts') as any,
  is_enterprise_install: Symbol('globalShortcut.is_enterprise_install') as any,
  enterprise: {
    id: Symbol('globalShortcut.enterprise.id') as any,
    name: Symbol('globalShortcut.enterprise.name') as any,
  },
});
export const buildMockMessageShortcut = (): MessageShortcut => ({
  type: 'message_action',
  trigger_id: Symbol('messageShortcut.trigger_id') as any,
  callback_id: Symbol('messageShortcut.callback_id') as any,
  user: {
    id: Symbol('messageShortcut.user.id') as any,
    name: Symbol('messageShortcut.user.name') as any,
    username: Symbol('messageShortcut.user.username') as any,
    team_id: Symbol('messageShortcut.user.team_id') as any,
  },
  team: {
    id: Symbol('messageShortcut.team.id') as any,
    domain: Symbol('messageShortcut.team.domain') as any,
    enterprise_id: Symbol('messageShortcut.team.enterprise_id') as any,
    enterprise_name: Symbol('messageShortcut.team.enterprise_name') as any,
  },
  token: Symbol('messageShortcut.token') as any,
  action_ts: Symbol('messageShortcut.action_ts') as any,
  is_enterprise_install: Symbol('messageShortcut.is_enterprise_install') as any,
  enterprise: {
    id: Symbol('messageShortcut.enterprise.id') as any,
    name: Symbol('messageShortcut.enterprise.name') as any,
  },
  message_ts: Symbol('messageShortcut.message_ts') as any,
  response_url: Symbol('messageShortcut.response_url') as any,
  message: {
    type: 'message',
    user: Symbol('messageShortcut.message.user') as any,
    ts: Symbol('messageShortcut.message.ts') as any,
    text: Symbol('messageShortcut.message.text') as any,
  },
  channel: {
    id: Symbol('messageShortcut.channel.id') as any,
    name: Symbol('messageShortcut.channel.name') as any,
  },
});
export const buildMockWebClient = (): WebClient =>
  ({
    chat: {
      delete: jest.fn(),
      deleteScheduledMessage: jest.fn(),
      getPermalink: jest.fn(),
      meMessage: jest.fn(),
      postEphemeral: jest.fn(),
      postMessage: jest.fn(),
      scheduleMessage: jest.fn(),
      scheduledMessages: {
        list: jest.fn(),
      },
      unfurl: jest.fn(),
      update: jest.fn(),
    },
    views: {
      open: jest.fn() as any,
      publish: jest.fn() as any,
      push: jest.fn() as any,
      update: jest.fn() as any,
    },
  } as any);

export const buildMockShortcutParam = (): ShortcutParam => ({
  ack: buildMockAck(),
  shortcut: buildMockGlobalShortcut(),
  client: buildMockWebClient(),
  payload: {} as any,
  say: jest.fn(),
  respond: jest.fn(),
  body: {} as any,
  context: {} as any,
  logger: {} as any,
});
