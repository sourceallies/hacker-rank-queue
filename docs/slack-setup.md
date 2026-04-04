# Slack App Configuration

This document outlines the manual Slack app configuration steps required for the HackerRank Queue bot.

## Setup Instructions

Visit the [Slack App Config](https://api.slack.com/apps/A01TFKZKPT7/general) to make changes.

## Shortcuts

### Request Pairing Interview

This shortcut allows teammates to request a pairing interview with available interviewers.

- **Name**: Request Pairing Interview
- **Short Description**: Schedule a pairing interview with teammates
- **Callback ID**: `shortcut-request-pairing`
- **Type**: Global shortcut

### Queue Preferences

This shortcut manages interview type and format preferences for the queue.

- **Name**: Queue Preferences
- **Short Description**: Configure your interview type and format preferences
- **Callback ID**: `shortcut-queue-preferences`
- **Type**: Global shortcut

### Removed Shortcuts

The **Leave Queue** shortcut (callback ID: `shortcut-leave-queue`) has been folded into the **Queue Preferences** shortcut modal and is no longer needed.

## Message Shortcuts

The following message shortcuts are available in channels:

- **Callback ID**: `message-shortcut-*` (used for message actions)

## Bot Permissions (Scopes)

Ensure the bot has the following OAuth scopes:

- `chat:write` - Post messages
- `chat:write.customize` - Customize message appearance
- `workflow.steps:execute` - Execute workflow steps
- `commands` - Listen to slash commands
- `users:read` - Read user information
- `reactions:read` - Read message reactions

## Testing Locally

When testing locally with `ngrok`:

1. Start the bot: `pnpm dev`
2. In another terminal, run: `ngrok http 3000`
3. Update the Slack App's "Interactivity & Shortcuts" page with `<ngrok-url>/slack/events`
4. Changes to shortcuts and permissions are reflected immediately in your test workspace

## Notes

- All manual changes to the Slack app dashboard require notification to the team
- Callback IDs in code must match the Slack dashboard configuration exactly
- For production deployments, coordinate manifest changes with AWS infrastructure updates
