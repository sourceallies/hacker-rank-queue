# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Slack bot for managing a queue of reviewers for HackerRank coding assessments. The bot connects reviewers with candidates by maintaining a queue of available reviewers, matching them by language preference, and managing the request/acceptance workflow through Slack interactions and direct messages.

## Commands

### Development

```bash
pnpm install          # Install dependencies
pnpm verify           # Run all checks: lint, format, compile, build, and test
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm lint             # Lint and fix
pnpm format           # Format code
pnpm compile          # Type check without emitting files
pnpm build            # Build for production
```

### Deployment

```bash
dev                   # Sign into AWS dev (requires sai-aws-auth setup)
pnpm deploy           # Deploy to dev (can run from any directory)
```

## Architecture

### Data Storage

The application uses **Google Spreadsheets as its database**. The `database` module (`src/database/database.ts`) manages connections to Google Sheets using service account authentication. Each "table" is a separate sheet within the spreadsheet:

- **users sheet**: Stores reviewers in the queue with their language preferences and last review date
- **activeReviews sheet**: Tracks ongoing review requests and their state
- **languages sheet**: Defines available programming languages

Repositories (`src/database/repos/`) provide CRUD operations on these sheets, mapping rows to TypeScript models.

### Core Models

- **User** (`src/database/models/User.ts`): Queue members with `id`, `name`, `languages[]`, and `lastReviewedDate`
- **ActiveReview** (`src/database/models/ActiveReview.ts`): Ongoing reviews with thread info, requestor, candidate identifier, and arrays tracking `acceptedReviewers`, `pendingReviewers`, and `declinedReviewers`

### Request Lifecycle

1. Someone requests a review via Slack shortcut (`requestReview`)
2. `QueueService` finds best reviewers by language match and last review time
3. `RequestService` sends DMs to selected reviewers with accept/decline buttons
4. Reviewers respond, transitioning from `pendingReviewers` to `acceptedReviewers` or `declinedReviewers`
5. Requests expire after `REQUEST_EXPIRATION_MIN` if not accepted (handled by `expireRequests` cron)
6. Once enough reviewers accept, the review is complete and closed via `ReviewCloser`

### Services

Services (`src/services/`) contain business logic:

- **QueueService**: Finds and ranks available reviewers
- **RequestService**: Manages sending review requests to users
- **ChatService**: Slack messaging utilities
- **ReviewActionService**: Processes accept/decline actions
- **HackParserService**: Optional integration for parsing candidate submissions via S3 and Lambda

### Bot Commands

Bot commands (`src/bot/`) handle Slack shortcuts and interactions:

- `joinQueue`: Add/update user in reviewer queue
- `leaveQueue`: Remove user from queue
- `requestReview`: Initiate a new review request
- `acceptReviewRequest`: Handle reviewer acceptance
- `declineReviewRequest`: Handle reviewer decline
- `requestPosition`: Show user their position in queue
- `triggerCron`: Dev-only manual cron trigger

Each bot command exports a `setup(app)` function that registers Slack event handlers.

### Cron Jobs

Scheduled jobs (`src/cron/index.ts`) run on node-cron in America/Chicago timezone:

- **healthCheck**: Daily at midnight
- **checkAllUsersActive**: Daily at 12:05 AM (verifies users still exist in Slack)
- **expireRequests**: Every 15 minutes during work hours

Work hours are configured via `WORKDAY_START_HOUR` and `WORKDAY_END_HOUR` environment variables.

### TypeScript Path Aliases

The project uses path aliases (configured in `tsconfig.json`):

- `@/*` → `src/*`
- `@bot/*` → `src/bot/*`
- `@cron` / `@cron/*` → `src/cron`
- `@database` → `src/database/database`
- `@models/*` → `src/database/models/*`
- `@repos/*` → `src/database/repos/*`
- `@services` → `src/services`
- `@utils/*` → `src/utils/*`

### Testing

- Jest with ts-jest preset
- Tests colocated in `__tests__` directories next to source
- Coverage thresholds enforced: 80% lines, 75% functions/statements, 55% branches
- `@utils/log` is mocked globally via `moduleNameMapper`
- Timezone set to `America/Chicago` for tests

## Commit Conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `chore:` - Refactor, lint fixes, formatting
- `ci:` - CI updates
- `docs:` - Documentation changes
- `BREAKING CHANGE:` - Breaking changes

PRs are squash-merged, so commit messages on feature branches don't need to follow the convention—just name the PR correctly.
