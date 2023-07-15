/* eslint-disable */
import {
  ActionParam,
  CallbackParam,
  GlobalShortcutParam,
  ShortcutParam,
  WebClient,
} from '@/slackTypes';
import {
  AckFn,
  App,
  Block,
  BlockAction,
  ButtonAction,
  GlobalShortcut,
  MessageShortcut,
  ViewOutput,
} from '@slack/bolt';
import { Chance } from 'chance';

export const buildMockAck = (): AckFn<void> => jest.fn();
export const buildMockTeam = () => ({
  id: Symbol('globalShortcut.team.id') as any,
  domain: Symbol('globalShortcut.team.domain') as any,
  enterprise_id: Symbol('globalShortcut.team.enterprise_id') as any,
  enterprise_name: Symbol('globalShortcut.team.enterprise_name') as any,
});
export const buildMockUser = () => ({
  id: 'globalShortcut.user.id' + Chance().integer(),
  username: Symbol('globalShortcut.user.username') as any,
  team_id: Symbol('globalShortcut.user.team_id') as any,
  name: 'globalShortcut.user.name',
});
export const buildMockGlobalShortcut = (): GlobalShortcut => ({
  type: 'shortcut',
  trigger_id: Symbol('globalShortcut.trigger_id') as any,
  callback_id: Symbol('globalShortcut.callback_id') as any,
  user: buildMockUser(),
  team: buildMockTeam(),
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
    conversations: {
      open: jest.fn(),
    },
    users: {
      info: jest.fn(),
    },
  }) as any;
export const buildMockApp = (): App =>
  ({
    client: buildMockWebClient(),
    action: jest.fn(),
  }) as any;
export const buildMockViewOutputBlock = (overrides?: Partial<Block>): Block => ({
  type: Symbol('type') as any,
  block_id: Symbol('block_id') as any,
  ...overrides,
});
export const buildMockViewOutput = (overrides?: Partial<ViewOutput>): ViewOutput => {
  const defaultBlock = buildMockViewOutputBlock();
  return {
    blocks: {
      [0]: defaultBlock,
    },
    state: {
      values: {
        [0]: {
          some_action_id: Symbol('some_action_id_value'),
        },
      },
    },
    bot_id: Symbol('bot_id') as any,
    ...overrides,
  } as ViewOutput;
};

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
  next: jest.fn(),
});

export const buildMockGlobalShortcutParam = (): GlobalShortcutParam => ({
  payload: {} as any,
  client: buildMockWebClient(),
  say: jest.fn(),
  respond: jest.fn(),
  body: {} as any,
  ack: buildMockAck(),
  shortcut: buildMockGlobalShortcut() as any,
  context: {} as any,
  logger: {} as any,
  next: jest.fn(),
});

export const buildMockCallbackParam = (overrides?: Partial<CallbackParam>): CallbackParam => ({
  ack: buildMockAck(),
  client: buildMockWebClient(),
  payload: {} as any,
  body: {
    view: buildMockViewOutput(),
  } as any,
  respond: jest.fn() as any,
  context: {} as any,
  logger: {} as any,
  view: {} as any,
  next: jest.fn(),
  ...overrides,
});

export const buildMockBlockAction = (): BlockAction<ButtonAction> => ({
  type: 'block_actions',
  actions: [],
  team: buildMockTeam(),
  user: buildMockUser(),
  token: Symbol('blockAction.token') as any,
  response_url: Symbol('blockAction.response_url') as any,
  trigger_id: Symbol('blockAction.trigger_id') as any,
  api_app_id: Symbol('blockAction.api_app_id') as any,
  container: Symbol('blockAction.container') as any,
  message: {
    type: 'message',
    user: Symbol('messageShortcut.message.user') as any,
    ts: '1234',
    text: Symbol('messageShortcut.message.text') as any,
  },
});

export const buildMockActionParam = (): ActionParam => ({
  payload: {} as any,
  ack: buildMockAck(),
  body: {
    user: buildMockUser(),
    message: {
      blocks: [],
    },
  } as any,
  client: buildMockWebClient(),
  action: buildMockBlockAction() as any,
  say: jest.fn(),
  respond: jest.fn(),
  context: {} as any,
  logger: {} as any,
  next: jest.fn(),
});
